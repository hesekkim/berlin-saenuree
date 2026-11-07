from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from core.config import settings
from core.json_store import read_keyed_list, write_json_store
from core.store_lock import STORE_LOCK
from services.blogger_service import (
    BloggerConflictError,
    BloggerNotFoundError,
    BloggerValidationError,
)
from services.rich_text import (
    extract_file_ids,
    extract_image_ids,
    MAX_BLOGGER_RICH_HTML_LENGTH,
    check_rich_html_length,
    extract_media_ids,
    sanitize_rich_html,
)
from services.published_status import normalize_published, read_published



def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


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


def _load_store() -> dict[str, Any]:
    path = settings.blogger_drafts_file
    drafts = [
        item for item in read_keyed_list(path, "drafts") if isinstance(item, dict)
    ]
    changed = False
    for item in drafts:
        before = dict(item)
        normalize_published(item)
        changed = changed or item != before
    if changed:
        write_json_store(path, {"drafts": drafts})
    return {"drafts": drafts}


def _save_store(store: dict[str, Any]) -> None:
    write_json_store(settings.blogger_drafts_file, store)


def _normalize_draft(raw: dict[str, Any]) -> dict[str, Any] | None:
    draft_id = str(raw.get("id") or "").strip()
    created_by = _normalize_email(str(raw.get("createdBy") or ""))
    source_blogger_id = str(raw.get("sourceBloggerId") or "").strip() or None
    created_at = str(raw.get("createdAt") or "").strip()
    updated_at = str(raw.get("updatedAt") or "").strip()
    if not draft_id or not created_by or not created_at or not updated_at:
        return None
    try:
        content_revision = int(raw.get("contentRevision", 1))
    except (TypeError, ValueError):
        return None
    source_content_revision = raw.get("sourceContentRevision")
    if source_blogger_id is not None:
        try:
            source_content_revision = max(1, int(source_content_revision))
        except (TypeError, ValueError):
            return None
    else:
        source_content_revision = None
    return {
        "id": draft_id,
        "sourceBloggerId": source_blogger_id,
        "sourceContentRevision": source_content_revision,
        "published": read_published(raw),
        "createdBy": created_by,
        "createdAt": created_at,
        "updatedAt": updated_at,
        "contentRevision": max(1, content_revision),
        "copies": _normalize_copies(raw.get("copies")),
    }


def _list_drafts_unlocked() -> list[dict[str, Any]]:
    store = _load_store()
    return [
        normalized
        for item in store["drafts"]
        if (normalized := _normalize_draft(item)) is not None
    ]


def _draft_media_ids(draft: dict[str, Any]) -> tuple[set[str], set[str]]:
    file_ids: set[str] = set()
    image_ids: set[str] = set()
    for copy in (draft.get("copies") or {}).values():
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


def _find_draft_index(
    drafts: list[dict[str, Any]],
    *,
    email: str,
    source_blogger_id: str | None,
) -> int | None:
    return next(
        (
            index
            for index, item in enumerate(drafts)
            if item["createdBy"] == email
            and item["sourceBloggerId"] == source_blogger_id
        ),
        None,
    )


def get_draft_for_user(email: str) -> dict[str, Any] | None:
    return get_draft_for_source(email, source_blogger_id=None)


def get_draft_for_source(
    email: str,
    *,
    source_blogger_id: str | None,
) -> dict[str, Any] | None:
    actor = _normalize_email(email)
    if not actor:
        raise BloggerValidationError("email is required")
    with STORE_LOCK:
        for item in _list_drafts_unlocked():
            if (
                item["createdBy"] == actor
                and item["sourceBloggerId"] == source_blogger_id
            ):
                return item
    return None


def list_drafts_for_user(email: str) -> list[dict[str, Any]]:
    actor = _normalize_email(email)
    if not actor:
        raise BloggerValidationError("email is required")
    with STORE_LOCK:
        return [item for item in _list_drafts_unlocked() if item["createdBy"] == actor]


def upsert_draft_for_user(payload: dict[str, Any], *, email: str) -> dict[str, Any]:
    return upsert_draft_for_source(
        payload,
        email=email,
        source_blogger_id=None,
        source_content_revision=None,
    )


def upsert_draft_for_source(
    payload: dict[str, Any],
    *,
    email: str,
    source_blogger_id: str | None,
    source_content_revision: int | None,
    replace_source_content_revision: bool = False,
) -> dict[str, Any]:
    actor = _normalize_email(email)
    if not actor:
        raise BloggerValidationError("email is required")
    if source_blogger_id is not None and source_content_revision is None:
        raise BloggerValidationError("sourceContentRevision is required")

    copies = _normalize_copies(
        payload.get("copies"), max_length=MAX_BLOGGER_RICH_HTML_LENGTH
    )
    published = bool(payload.get("published", True))
    now = _utc_now_iso()

    with STORE_LOCK:
        current = _list_drafts_unlocked()
        index = _find_draft_index(
            current,
            email=actor,
            source_blogger_id=source_blogger_id,
        )

        if index is None:
            draft = {
                "id": str(uuid.uuid4()),
                "sourceBloggerId": source_blogger_id,
                "sourceContentRevision": source_content_revision,
                "published": published,
                "createdBy": actor,
                "createdAt": now,
                "updatedAt": now,
                "contentRevision": 1,
                "copies": copies,
            }
            current.append(draft)
            _save_store({"drafts": current})
            return draft

        existing = current[index]
        expected_revision = payload.get("contentRevision")
        try:
            expected = int(expected_revision)
        except (TypeError, ValueError) as error:
            raise BloggerValidationError("contentRevision is required") from error
        if expected != int(existing["contentRevision"]):
            raise BloggerConflictError("contentRevision mismatch", dict(existing))

        previous_media_ids = _draft_media_ids(existing)

        updated = {
            "id": existing["id"],
            "sourceBloggerId": existing["sourceBloggerId"],
            "sourceContentRevision": (
                source_content_revision
                if replace_source_content_revision
                else existing["sourceContentRevision"]
            ),
            "published": published,
            "createdBy": existing["createdBy"],
            "createdAt": existing["createdAt"],
            "updatedAt": now,
            "contentRevision": int(existing["contentRevision"]) + 1,
            "copies": copies,
        }
        current[index] = updated
        _save_store({"drafts": current})
        _cleanup_removed_media(previous_media_ids, _draft_media_ids(updated))
        return updated


def delete_draft_for_user(email: str) -> None:
    delete_draft_for_source(email, source_blogger_id=None)


def delete_draft_for_source(email: str, *, source_blogger_id: str | None) -> None:
    actor = _normalize_email(email)
    if not actor:
        raise BloggerValidationError("email is required")
    with STORE_LOCK:
        current = _list_drafts_unlocked()
        deleted = [
            item
            for item in current
            if item["createdBy"] == actor
            and item["sourceBloggerId"] == source_blogger_id
        ]
        remaining = [item for item in current if item not in deleted]
        if len(remaining) == len(current):
            raise BloggerNotFoundError("Blogger draft not found")
        _save_store({"drafts": remaining})

        media_file_ids: set[str] = set()
        media_image_ids: set[str] = set()
        for draft in deleted:
            file_ids, image_ids = _draft_media_ids(draft)
            media_file_ids.update(file_ids)
            media_image_ids.update(image_ids)

        if media_file_ids or media_image_ids:
            from services.posts_service import _cleanup_unused_media

            _cleanup_unused_media(
                image_ids=media_image_ids,
                file_ids=media_file_ids,
            )


def delete_drafts_for_source(source_blogger_id: str) -> None:
    source_id = str(source_blogger_id or "").strip()
    if not source_id:
        raise BloggerValidationError("sourceBloggerId is required")

    with STORE_LOCK:
        current = _list_drafts_unlocked()
        deleted = [
            item for item in current if item["sourceBloggerId"] == source_id
        ]
        if not deleted:
            return
        _save_store({"drafts": [item for item in current if item not in deleted]})

        media_file_ids: set[str] = set()
        media_image_ids: set[str] = set()
        for draft in deleted:
            file_ids, image_ids = _draft_media_ids(draft)
            media_file_ids.update(file_ids)
            media_image_ids.update(image_ids)

        if media_file_ids or media_image_ids:
            from services.posts_service import _cleanup_unused_media

            _cleanup_unused_media(
                image_ids=media_image_ids,
                file_ids=media_file_ids,
            )


def list_draft_media_ids() -> tuple[str, ...]:
    """Sanitized draft HTML media ids for GC protection (043)."""
    seen: list[str] = []
    found: set[str] = set()
    with STORE_LOCK:
        for draft in _list_drafts_unlocked():
            for copy in (draft.get("copies") or {}).values():
                if not isinstance(copy, dict):
                    continue
                for media_id in extract_media_ids(str(copy.get("body") or "")):
                    if media_id in found:
                        continue
                    found.add(media_id)
                    seen.append(media_id)
    return tuple(seen)


def remove_language_from_all_blogger_drafts(language: str) -> None:
    code = str(language).strip()
    if not code:
        return
    with STORE_LOCK:
        store = _load_store()
        changed = False
        for item in store["drafts"]:
            copies = item.get("copies") or {}
            if code not in copies:
                continue
            item["copies"] = {key: value for key, value in copies.items() if key != code}
            item["contentRevision"] = int(item.get("contentRevision") or 1) + 1
            item["updatedAt"] = _utc_now_iso()
            changed = True
        if changed:
            _save_store(store)
