from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime, timezone
from typing import Any

from core.config import settings
from core.json_store import read_keyed_list, write_json_store
from core.store_lock import STORE_LOCK
from services.rich_text import (
    extract_file_ids,
    extract_image_ids,
    extract_media_ids,
    MAX_BLOGGER_RICH_HTML_LENGTH,
    MAX_MEDIA_WIDTH,
    check_rich_html_length,
    rich_html_has_content,
    rich_html_plain_text,
    sanitize_rich_html,
)
from services.image_optimize_service import (
    ImageOptimizeError,
    delete_derivatives,
    optimize_publish_from_file_id,
)
from services.published_status import normalize_published, read_published
from services.site_settings_store import get_default_language

logger = logging.getLogger(__name__)

DEFAULT_LIST_LIMIT = 30
MAX_LIST_LIMIT = 100
BLOGGER_PAGE_SLUG = "blogger"

_IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
_IMG_VALUE_RE = re.compile(r'\b(data-media-id|data-image-id|data-media-width)\s*=\s*"([^"]*)"', re.IGNORECASE)


class BloggerError(Exception):
    pass


class BloggerValidationError(BloggerError):
    pass


class BloggerNotFoundError(BloggerError):
    pass


class BloggerPermissionError(BloggerError):
    pass


class BloggerConflictError(BloggerError):
    def __init__(self, message: str, item: dict[str, Any]) -> None:
        super().__init__(message)
        self.item = item


def can_mutate_blogger(role: str, email: str, item: dict[str, Any]) -> bool:
    if role in ("site_admin", "page_admin"):
        return True
    return role == "page_manager" and item.get("createdBy") == str(email or "").strip().lower()


def resolve_blogger_copy(
    copies: dict[str, dict[str, str]] | None,
    language: str | None,
    default_language: str,
) -> dict[str, str]:
    """Current language, then the site default, then `en`, then any copy."""
    normalized = copies or {}
    candidate = (language or "").strip()
    for code in (candidate, default_language, "en"):
        if code and code in normalized:
            return normalized[code]
    if normalized:
        return next(iter(normalized.values()))
    return {"title": "", "body": ""}


def _normalize_creator_email(email: str) -> str:
    return str(email or "").strip().lower()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_store() -> dict[str, Any]:
    path = settings.blogger_file
    normalized_items = [
        item for item in read_keyed_list(path, "bloggers") if isinstance(item, dict)
    ]
    changed = False
    for item in normalized_items:
        before = dict(item)
        normalize_published(item)
        changed = changed or item != before
    if changed:
        write_json_store(path, {"bloggers": normalized_items})
    return {"bloggers": normalized_items}


def _save_store(store: dict[str, Any]) -> None:
    write_json_store(settings.blogger_file, store)


def _normalize_copies(
    raw: object, *, max_length: int | None = None
) -> dict[str, dict[str, str]]:
    if not isinstance(raw, dict):
        return {}
    normalized: dict[str, dict[str, str]] = {}
    for language, value in raw.items():
        code = str(language).strip()
        if not code or not isinstance(value, dict):
            continue
        title = str(value.get("title") or "").strip()
        body = value.get("body")
        sanitized = sanitize_rich_html("" if body is None else str(body))
        if max_length is not None:
            check_rich_html_length(sanitized, max_length)
        normalized[code] = {
            "title": title,
            "body": sanitized,
        }
    return normalized


def _require_default_copy(copies: dict[str, dict[str, str]], language: str) -> None:
    copy = copies.get(language)
    if not isinstance(copy, dict):
        raise BloggerValidationError(f"{language} title and body are required")
    if not str(copy.get("title") or "").strip():
        raise BloggerValidationError(f"{language} title is required")
    if not rich_html_has_content(str(copy.get("body") or "")):
        raise BloggerValidationError(f"{language} body is required")


def _replace_img_attr(tag: str, name: str, value: str) -> str:
    pattern = re.compile(rf'(\b{name}\s*=\s*")[^"]*(")', re.IGNORECASE)
    replaced = pattern.sub(
        lambda match: f"{match.group(1)}{value}{match.group(2)}",
        tag,
        count=1,
    )
    if replaced != tag:
        return replaced
    return f'{tag[:-1]} {name}="{value}">'


def _publish_copies(
    copies: dict[str, dict[str, str]],
) -> tuple[dict[str, dict[str, str]], set[str]]:
    created_image_ids: set[str] = set()
    cache: dict[tuple[str, int], dict[str, Any]] = {}

    def transform_body(body: str) -> str:
        def transform_tag(match: re.Match[str]) -> str:
            tag = match.group(0)
            attrs = {key.lower(): value for key, value in _IMG_VALUE_RE.findall(tag)}
            try:
                media_id = attrs["data-media-id"]
                width = int(attrs.get("data-media-width") or MAX_MEDIA_WIDTH)
            except (KeyError, TypeError, ValueError):
                raise ImageOptimizeError(
                    "Published images require data-media-id"
                )
            key = (media_id.lower(), width)
            result = cache.get(key)
            if result is None:
                result = optimize_publish_from_file_id(
                    media_id,
                    width,
                )
                cache[key] = result
                if result.get("created"):
                    created_image_ids.add(str(result["imageId"]))
            return _replace_img_attr(
                _replace_img_attr(tag, "data-image-id", str(result["imageId"])),
                "src",
                str(result["displayUrl"]),
            )

        return _IMG_TAG_RE.sub(transform_tag, body)

    try:
        published = {
            language: {
                "title": copy.get("title", ""),
                "body": transform_body(copy.get("body", "")),
            }
            for language, copy in copies.items()
        }
    except (ImageOptimizeError, OSError, KeyError, ValueError) as error:
        for image_id in created_image_ids:
            try:
                delete_derivatives(image_id)
            except Exception:  # noqa: BLE001
                logger.warning("Failed to clean up publish derivative %s", image_id)
        raise BloggerValidationError(f"Failed to optimize publish images: {error}") from error
    return published, created_image_ids


def _cleanup_created_derivatives(image_ids: set[str]) -> None:
    for image_id in image_ids:
        try:
            delete_derivatives(image_id)
        except Exception:  # noqa: BLE001
            logger.warning("Failed to clean up publish derivative %s", image_id)


def _normalize_blogger(raw: dict[str, Any]) -> dict[str, Any] | None:
    blogger_id = str(raw.get("id") or "").strip()
    created_by = str(raw.get("createdBy") or "").strip().lower()
    created_at = str(raw.get("createdAt") or "").strip()
    updated_at = str(raw.get("updatedAt") or "").strip()
    if not blogger_id or not created_by or not created_at or not updated_at:
        return None
    try:
        content_revision = int(raw.get("contentRevision", 1))
    except (TypeError, ValueError):
        return None
    copies = _normalize_copies(raw.get("copies"))
    return {
        "id": blogger_id,
        "published": read_published(raw),
        "createdBy": created_by,
        "createdAt": created_at,
        "updatedAt": updated_at,
        "contentRevision": max(1, content_revision),
        "copies": copies,
    }


def _list_bloggers_unlocked() -> list[dict[str, Any]]:
    store = _load_store()
    items = [
        normalized
        for item in store["bloggers"]
        if (normalized := _normalize_blogger(item)) is not None
    ]
    return sorted(
        items,
        key=lambda item: (item["createdAt"], item["id"]),
        reverse=True,
    )


def _clamp_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_LIST_LIMIT
    try:
        value = int(limit)
    except (TypeError, ValueError):
        return DEFAULT_LIST_LIMIT
    return max(1, min(MAX_LIST_LIMIT, value))


def _clamp_offset(offset: int | None) -> int:
    if offset is None:
        return 0
    try:
        value = int(offset)
    except (TypeError, ValueError):
        return 0
    return max(0, value)


def filter_blogger(
    items: list[dict[str, Any]],
    *,
    query: str | None = None,
    created_by: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    published: bool | None = None,
) -> list[dict[str, Any]]:
    normalized_query = (query or "").strip().casefold()
    normalized_creator = _normalize_creator_email(created_by or "")

    def matches(item: dict[str, Any]) -> bool:
        if normalized_query:
            haystack = "\n".join(
                (
                    str(copy.get("title") or "")
                    + " "
                    + rich_html_plain_text(str(copy.get("body") or ""))
                )
                for copy in (item.get("copies") or {}).values()
                if isinstance(copy, dict)
            ).casefold()
            if normalized_query not in haystack:
                return False
        if normalized_creator and item.get("createdBy") != normalized_creator:
            return False
        if from_date is not None or to_date is not None:
            try:
                created_date = date.fromisoformat(str(item.get("createdAt", ""))[:10])
            except ValueError:
                return False
            if from_date is not None and created_date < from_date:
                return False
            if to_date is not None and created_date > to_date:
                return False
        if published is not None and bool(item.get("published")) != published:
            return False
        return True

    return [item for item in items if matches(item)]


def list_blogger(
    *,
    limit: int | None = None,
    offset: int | None = None,
    query: str | None = None,
    created_by: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    published: bool | None = None,
) -> dict[str, Any]:
    with STORE_LOCK:
        items = filter_blogger(
            _list_bloggers_unlocked(),
            query=query,
            created_by=created_by,
            from_date=from_date,
            to_date=to_date,
            published=published,
        )
        total = len(items)
        clamped_limit = _clamp_limit(limit)
        clamped_offset = _clamp_offset(offset)
        page = items[clamped_offset : clamped_offset + clamped_limit]
        return {
            "items": page,
            "total": total,
            "limit": clamped_limit,
            "offset": clamped_offset,
        }


def get_blogger(blogger_id: str) -> dict[str, Any]:
    with STORE_LOCK:
        for item in _list_bloggers_unlocked():
            if item["id"] == blogger_id:
                return item
    raise BloggerNotFoundError("Blogger not found")


def _index_of(items: list[dict[str, Any]], blogger_id: str) -> int | None:
    return next((idx for idx, item in enumerate(items) if item["id"] == blogger_id), None)


def create_blogger(
    payload: dict[str, Any],
    *,
    created_by: str,
    role: str,
) -> dict[str, Any]:
    email = _normalize_creator_email(created_by)
    if not email:
        raise BloggerValidationError("createdBy is required")

    copies = _normalize_copies(
        payload.get("copies"), max_length=MAX_BLOGGER_RICH_HTML_LENGTH
    )
    _require_default_copy(copies, get_default_language())
    published = bool(payload.get("published", True))
    published_copies = copies
    created_image_ids: set[str] = set()
    if published:
        published_copies, created_image_ids = _publish_copies(copies)

    item = {
        "id": str(uuid.uuid4()),
        "published": published,
        "createdBy": email,
        "createdAt": _utc_now_iso(),
        "updatedAt": _utc_now_iso(),
        "contentRevision": 1,
        "copies": published_copies,
    }
    with STORE_LOCK:
        current = _list_bloggers_unlocked()
        current.append(item)
        try:
            _save_store({"bloggers": current})
        except Exception:
            _cleanup_created_derivatives(created_image_ids)
            raise
    return item


def update_blogger(
    blogger_id: str,
    payload: dict[str, Any],
    *,
    role: str,
    created_by: str | None = None,
) -> dict[str, Any]:
    # Image publishing is slow, so it runs outside the store lock. The write
    # below re-checks contentRevision and rejects the update if another save
    # landed in the meantime.
    with STORE_LOCK:
        current = _list_bloggers_unlocked()
        index = _index_of(current, blogger_id)
        if index is None:
            raise BloggerNotFoundError("Blogger not found")
        existing = current[index]
        actor = created_by or existing["createdBy"]
        if not can_mutate_blogger(role, actor, existing):
            raise BloggerPermissionError("Cannot modify this blogger")

        expected_revision = payload.get("contentRevision")
        try:
            expected = int(expected_revision)
        except (TypeError, ValueError) as error:
            raise BloggerValidationError("contentRevision is required") from error
        if expected != int(existing["contentRevision"]):
            raise BloggerConflictError("contentRevision mismatch", dict(existing))

        next_copies = _normalize_copies(
            payload.get("copies"), max_length=MAX_BLOGGER_RICH_HTML_LENGTH
        )
        merged = dict(existing.get("copies") or {})
        if next_copies:
            merged.update(next_copies)
        _require_default_copy(merged, get_default_language())

    published = bool(payload.get("published", existing["published"]))
    published_copies = merged
    created_image_ids: set[str] = set()
    if published:
        published_copies, created_image_ids = _publish_copies(merged)

    with STORE_LOCK:
        current = _list_bloggers_unlocked()
        index = _index_of(current, blogger_id)
        if index is None:
            _cleanup_created_derivatives(created_image_ids)
            raise BloggerNotFoundError("Blogger not found")
        latest = current[index]
        if int(latest["contentRevision"]) != int(existing["contentRevision"]):
            _cleanup_created_derivatives(created_image_ids)
            raise BloggerConflictError("contentRevision mismatch", dict(latest))

        updated = {
            "id": existing["id"],
            "published": published,
            "createdBy": existing["createdBy"],
            "createdAt": existing["createdAt"],
            "updatedAt": _utc_now_iso(),
            "contentRevision": int(existing["contentRevision"]) + 1,
            "copies": published_copies,
        }
        current[index] = updated
        try:
            _save_store({"bloggers": current})
        except Exception:
            _cleanup_created_derivatives(created_image_ids)
            raise
        _cleanup_removed_media(
            _copies_media_ids(existing.get("copies") or {}),
            _copies_media_ids(published_copies),
        )
    return updated

def delete_blogger(blogger_id: str, *, role: str, email: str | None = None) -> None:
    from services.blogger_trash_service import move_to_trash
    from services.blogger_draft_service import delete_drafts_for_source

    move_to_trash(blogger_id, deleted_by=email or "", role=role)
    delete_drafts_for_source(blogger_id)


def active_media_refs() -> set[str]:
    refs: set[str] = set()
    with STORE_LOCK:
        for blogger in _list_bloggers_unlocked():
            for copy in (blogger.get("copies") or {}).values():
                if isinstance(copy, dict):
                    refs.update(extract_media_ids(str(copy.get("body") or "")))
    return refs


def _copies_media_ids(copies: dict[str, Any]) -> tuple[set[str], set[str]]:
    file_ids: set[str] = set()
    image_ids: set[str] = set()
    for copy in copies.values():
        if isinstance(copy, dict):
            body = str(copy.get("body") or "")
            file_ids.update(extract_file_ids(body))
            image_ids.update(extract_image_ids(body))
    return file_ids, image_ids


def _cleanup_removed_media(
    previous: tuple[set[str], set[str]], current: tuple[set[str], set[str]]
) -> None:
    previous_file_ids, previous_image_ids = previous
    current_file_ids, current_image_ids = current
    removed_file_ids = previous_file_ids - current_file_ids
    removed_image_ids = previous_image_ids - current_image_ids
    if not removed_file_ids and not removed_image_ids:
        return

    from services.posts_service import _cleanup_unused_media

    _cleanup_unused_media(
        image_ids=removed_image_ids,
        file_ids=removed_file_ids,
    )


def remove_language_from_all_bloggers(language: str) -> None:
    code = str(language).strip()
    if not code:
        return
    with STORE_LOCK:
        store = _load_store()
        changed = False
        for item in store["bloggers"]:
            copies = item.get("copies") or {}
            if code not in copies:
                continue
            item["copies"] = {key: value for key, value in copies.items() if key != code}
            item["contentRevision"] = int(item.get("contentRevision") or 1) + 1
            item["updatedAt"] = _utc_now_iso()
            changed = True
        if changed:
            _save_store(store)
