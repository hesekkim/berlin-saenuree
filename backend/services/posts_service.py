"""Photo posts store (CMS-only, ticket 030)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

from core.config import settings
from core.json_store import read_keyed_list, write_json_store
from core.store_lock import STORE_LOCK
from services.image_optimize_service import (
    ImageOptimizeNotFoundError,
    get_image_variant,
)
from services.media_files_service import (
    MediaFilesNotFoundError,
    get_file_record,
)
from services.media_refs import (
    cleanup_unused_media,
    collect_active_media_refs,
    refs_from_copies,
)
from services.rich_text import (
    MAX_RICH_HTML_LENGTH,
    check_rich_html_length,
    rich_html_plain_text,
    sanitize_rich_html,
)
from services.published_status import normalize_published, read_published


MAX_POST_IMAGES = 30
MAX_POST_IMAGE_BYTES = 10 * 1024 * 1024
MAX_POST_VIDEO_BYTES = 100 * 1024 * 1024
DEFAULT_LIST_LIMIT = 30
MAX_LIST_LIMIT = 100
POSTS_PAGE_SLUG = "posts"



class PostsError(Exception):
    pass


class PostsValidationError(PostsError):
    pass


class PostsNotFoundError(PostsError):
    pass


class PostsPermissionError(PostsError):
    pass


class PostsConflictError(PostsError):
    """Optimistic lock failure — carries the current post for 409 responses."""

    def __init__(self, message: str, post: dict[str, Any]) -> None:
        super().__init__(message)
        self.post = post


def can_mutate_post(role: str, email: str, post: dict[str, Any]) -> bool:
    if role in ("site_admin", "page_admin"):
        return True
    return role == "page_manager" and post.get("createdBy") == email


def can_pin_post(role: str) -> bool:
    return role in ("site_admin", "page_admin")


def _normalize_creator_email(email: str) -> str:
    return str(email or "").strip().lower()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_store() -> dict[str, Any]:
    """Raises JsonStoreCorruptError instead of returning an empty store."""
    path = settings.posts_file
    normalized_posts = [
        item for item in read_keyed_list(path, "posts") if isinstance(item, dict)
    ]
    changed = False
    for item in normalized_posts:
        before = dict(item)
        normalize_published(item)
        changed = changed or item != before
    if changed:
        write_json_store(path, {"posts": normalized_posts})
    return {"posts": normalized_posts}


def _save_store(store: dict[str, Any]) -> None:
    write_json_store(settings.posts_file, store)



def _normalize_copies(
    raw: object, *, max_length: int | None = None
) -> dict[str, dict[str, str]]:
    if not isinstance(raw, dict):
        return {}
    copies: dict[str, dict[str, str]] = {}
    for language, value in raw.items():
        code = str(language).strip()
        if not code:
            continue
        if isinstance(value, dict):
            body = value.get("body")
        else:
            body = value
        sanitized = sanitize_rich_html("" if body is None else str(body))
        if max_length is not None:
            check_rich_html_length(sanitized, max_length)
        copies[code] = {"body": sanitized}
    return copies


def _assert_media_refs(image_id: str, source_file_id: str) -> None:
    try:
        record = get_image_variant(image_id, "display")
    except ImageOptimizeNotFoundError as error:
        raise PostsValidationError("imageId not found") from error
    try:
        source_file = get_file_record(source_file_id)
    except MediaFilesNotFoundError as error:
        raise PostsValidationError("sourceFileId not found") from error
    try:
        source_size = int(source_file["meta"].get("sizeBytes") or 0)
    except (KeyError, TypeError, ValueError) as error:
        raise PostsValidationError("image source file has an invalid size") from error
    if source_size < 0 or source_size > MAX_POST_IMAGE_BYTES:
        raise PostsValidationError("image exceeds maximum size")
    meta_source = str(record["meta"].get("sourceFileId") or "").strip()
    if meta_source and meta_source != source_file_id:
        raise PostsValidationError("sourceFileId does not match image")


def _normalize_media(raw: object) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        raise PostsValidationError("media must be a list")
    if len(raw) < 1:
        raise PostsValidationError("at least one media item is required")
    if len(raw) > MAX_POST_IMAGES:
        raise PostsValidationError(f"at most {MAX_POST_IMAGES} media items are allowed")

    media: list[dict[str, Any]] = []
    video_count = 0
    for item in raw:
        if not isinstance(item, dict):
            raise PostsValidationError("each media item must be an object")
        media_type = str(item.get("type") or "image").strip().lower()
        if media_type == "video":
            video_count += 1
            if video_count > 1:
                raise PostsValidationError("at most one video is allowed per post")
            file_id = str(item.get("fileId") or "").strip()
            if not file_id:
                raise PostsValidationError("video requires fileId")
            try:
                record = get_file_record(file_id)
            except MediaFilesNotFoundError as error:
                raise PostsValidationError("video fileId not found") from error
            meta = record["meta"]
            if (
                str(meta.get("contentType") or "").strip().lower() != "video/mp4"
                or not str(meta.get("originalName") or "").lower().endswith(".mp4")
            ):
                raise PostsValidationError("video must be an MP4 file")
            if int(meta.get("sizeBytes") or 0) > min(
                MAX_POST_VIDEO_BYTES, int(settings.media_max_file_bytes)
            ):
                raise PostsValidationError("video exceeds maximum size")
            try:
                width = int(item.get("width"))
                height = int(item.get("height"))
            except (TypeError, ValueError) as error:
                raise PostsValidationError(
                    "video requires integer width and height"
                ) from error
            if width < 1 or height < 1:
                raise PostsValidationError("video dimensions must be positive")
            media.append(
                {
                    "type": "video",
                    "fileId": file_id,
                    "width": width,
                    "height": height,
                }
            )
            continue
        if media_type != "image":
            raise PostsValidationError("media type must be image or video")
        image_id = str(item.get("imageId") or "").strip()
        source_file_id = str(item.get("sourceFileId") or "").strip()
        if not image_id or not source_file_id:
            raise PostsValidationError(
                "each image requires imageId and sourceFileId"
            )
        _assert_media_refs(image_id, source_file_id)
        try:
            width = int(item.get("width"))
            height = int(item.get("height"))
        except (TypeError, ValueError) as error:
            raise PostsValidationError(
                "each image requires integer width and height"
            ) from error
        if width < 1 or height < 1:
            raise PostsValidationError("image width and height must be positive")
        media.append(
            {
                "type": "image",
                "imageId": image_id,
                "sourceFileId": source_file_id,
                "width": width,
                "height": height,
            }
        )
    return media


def _normalize_post(raw: dict[str, Any]) -> dict[str, Any] | None:
    post_id = str(raw.get("id") or "").strip()
    created_by = str(raw.get("createdBy") or "").strip()
    created_at = str(raw.get("createdAt") or "").strip()
    updated_at = str(raw.get("updatedAt") or "").strip()
    if not post_id or not created_by or not created_at or not updated_at:
        return None
    try:
        content_revision = int(raw.get("contentRevision", 1))
    except (TypeError, ValueError):
        return None
    media_raw = raw.get("media", raw.get("images"))
    if not isinstance(media_raw, list) or not media_raw:
        return None
    media: list[dict[str, Any]] = []
    video_count = 0
    for item in media_raw:
        if not isinstance(item, dict):
            return None
        media_type = str(item.get("type") or "image").strip().lower()
        if media_type == "video":
            file_id = str(item.get("fileId") or "").strip()
            try:
                width = int(item.get("width"))
                height = int(item.get("height"))
            except (TypeError, ValueError):
                return None
            if not file_id or width < 1 or height < 1:
                return None
            video_count += 1
            if video_count > 1:
                return None
            media.append(
                {
                    "type": "video",
                    "fileId": file_id,
                    "width": width,
                    "height": height,
                }
            )
            continue
        if media_type != "image":
            return None
        image_id = str(item.get("imageId") or "").strip()
        source_file_id = str(item.get("sourceFileId") or "").strip()
        if not image_id or not source_file_id:
            return None
        try:
            width = int(item.get("width"))
            height = int(item.get("height"))
        except (TypeError, ValueError):
            return None
        if width < 1 or height < 1:
            return None
        media.append(
            {
                "type": "image",
                "imageId": image_id,
                "sourceFileId": source_file_id,
                "width": width,
                "height": height,
            }
        )
    return {
        "id": post_id,
        "published": read_published(raw),
        "pinned": bool(raw.get("pinned", False)),
        "createdBy": created_by,
        "createdAt": created_at,
        "updatedAt": updated_at,
        "contentRevision": max(1, content_revision),
        "media": media,
        "copies": _normalize_copies(raw.get("copies")),
    }


def _sort_posts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # pinned DESC, then createdAt DESC, then id DESC (stable tie-break).
    return sorted(
        items,
        key=lambda item: (item["pinned"], item["createdAt"], item["id"]),
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


def filter_posts(
    items: list[dict[str, Any]],
    *,
    query: str | None = None,
    created_by: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    published: bool | None = None,
    pinned: bool | None = None,
) -> list[dict[str, Any]]:
    """Return posts matching every supplied admin list filter."""
    normalized_query = (query or "").strip().casefold()
    normalized_creator = _normalize_creator_email(created_by or "")

    def matches(post: dict[str, Any]) -> bool:
        if normalized_query:
            caption = "\n".join(
                rich_html_plain_text(str(copy.get("body") or ""))
                for copy in (post.get("copies") or {}).values()
                if isinstance(copy, dict)
            ).casefold()
            if normalized_query not in caption:
                return False
        if normalized_creator and post.get("createdBy") != normalized_creator:
            return False
        if from_date is not None or to_date is not None:
            try:
                created_date = date.fromisoformat(
                    str(post.get("createdAt", ""))[:10]
                )
            except ValueError:
                return False
            if from_date is not None and created_date < from_date:
                return False
            if to_date is not None and created_date > to_date:
                return False
        if published is not None and bool(post.get("published")) != published:
            return False
        if pinned is not None and bool(post.get("pinned")) != pinned:
            return False
        return True

    return [post for post in items if matches(post)]


def _media_ids_from_post(post: dict[str, Any]) -> tuple[set[str], set[str]]:
    image_ids: set[str] = set()
    file_ids: set[str] = set()
    for item in post.get("media", post.get("images")) or []:
        image_id = item.get("imageId")
        source_file_id = item.get("sourceFileId") or item.get("fileId")
        if image_id:
            image_ids.add(str(image_id))
        if source_file_id:
            file_ids.add(str(source_file_id))
    return image_ids, file_ids


def list_post_media_refs() -> set[str]:
    """Media ids referenced by live posts (images and caption bodies)."""
    refs: set[str] = set()
    with STORE_LOCK:
        for post in _list_posts_unlocked():
            image_ids, file_ids = _media_ids_from_post(post)
            refs.update(image_ids)
            refs.update(file_ids)
            refs.update(refs_from_copies(post.get("copies")))
    return refs


def active_media_refs() -> set[str]:
    """Every media id referenced by any feature (see `services.media_refs`)."""
    return collect_active_media_refs()


def _cleanup_unused_media(
    *,
    image_ids: set[str],
    file_ids: set[str],
) -> None:
    cleanup_unused_media(image_ids=image_ids, file_ids=file_ids)


def _list_posts_unlocked() -> list[dict[str, Any]]:
    store = _load_store()
    items = [
        normalized
        for item in store["posts"]
        if (normalized := _normalize_post(item)) is not None
    ]
    return _sort_posts(items)


def list_posts(
    *,
    limit: int | None = None,
    offset: int | None = None,
    query: str | None = None,
    created_by: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    published: bool | None = None,
    pinned: bool | None = None,
) -> dict[str, Any]:
    with STORE_LOCK:
        items = filter_posts(
            _list_posts_unlocked(),
            query=query,
            created_by=created_by,
            from_date=from_date,
            to_date=to_date,
            published=published,
            pinned=pinned,
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


def get_post(post_id: str) -> dict[str, Any]:
    with STORE_LOCK:
        for post in _list_posts_unlocked():
            if post["id"] == post_id:
                return post
    raise PostsNotFoundError("Post not found")


def create_post(
    payload: dict[str, Any],
    *,
    created_by: str,
    role: str,
) -> dict[str, Any]:
    email = _normalize_creator_email(created_by)
    if not email:
        raise PostsValidationError("createdBy is required")

    with STORE_LOCK:
        media = _normalize_media(payload.get("media", payload.get("images")))
        copies = _normalize_copies(
            payload.get("copies"), max_length=MAX_RICH_HTML_LENGTH
        )
        now = _utc_now_iso()
        if can_pin_post(role):
            pinned = bool(payload.get("pinned", False))
        else:
            pinned = False
        post = {
            "id": str(uuid.uuid4()),
            "published": bool(payload.get("published", True)),
            "pinned": pinned,
            "createdBy": email,
            "createdAt": now,
            "updatedAt": now,
            "contentRevision": 1,
            "media": media,
            "copies": copies,
        }
        current = _list_posts_unlocked()
        current.append(post)
        _save_store({"posts": current})
        return post


def update_post(
    post_id: str,
    payload: dict[str, Any],
    *,
    role: str,
) -> dict[str, Any]:
    with STORE_LOCK:
        current = _list_posts_unlocked()
        index = next(
            (i for i, item in enumerate(current) if item["id"] == post_id), None
        )
        if index is None:
            raise PostsNotFoundError("Post not found")

        existing = current[index]
        expected_revision = payload.get("contentRevision")
        try:
            expected = int(expected_revision)
        except (TypeError, ValueError) as error:
            raise PostsValidationError("contentRevision is required") from error

        if expected != int(existing["contentRevision"]):
            raise PostsConflictError("contentRevision mismatch", dict(existing))

        media = _normalize_media(payload.get("media", payload.get("images")))
        copies = _normalize_copies(
            payload.get("copies"), max_length=MAX_RICH_HTML_LENGTH
        )
        previous_image_ids, previous_file_ids = _media_ids_from_post(existing)

        if can_pin_post(role):
            pinned = bool(payload.get("pinned", existing["pinned"]))
        else:
            pinned = bool(existing["pinned"])

        updated = {
            "id": existing["id"],
            "published": bool(payload.get("published", existing["published"])),
            "pinned": pinned,
            "createdBy": existing["createdBy"],
            "createdAt": existing["createdAt"],
            "updatedAt": _utc_now_iso(),
            "contentRevision": int(existing["contentRevision"]) + 1,
            "media": media,
            "copies": copies,
        }
        current[index] = updated
        _save_store({"posts": current})

        new_image_ids, new_file_ids = _media_ids_from_post(updated)
        _cleanup_unused_media(
            image_ids=previous_image_ids - new_image_ids,
            file_ids=previous_file_ids - new_file_ids,
        )
        return updated


def delete_post(post_id: str, *, deleted_by: str | None = None) -> None:
    from services.posts_trash_service import move_to_trash

    with STORE_LOCK:
        current = _list_posts_unlocked()
        target = next((item for item in current if item["id"] == post_id), None)
        if target is None:
            raise PostsNotFoundError("Post not found")
        move_to_trash(post_id, deleted_by=deleted_by or target.get("createdBy", ""))
        return None


def remove_language_from_all_posts(language: str) -> None:
    code = str(language).strip()
    if not code:
        return
    with STORE_LOCK:
        current = _list_posts_unlocked()
        changed = False
        for post in current:
            copies = post.get("copies") or {}
            if code not in copies:
                continue
            copies = dict(copies)
            del copies[code]
            post["copies"] = copies
            post["contentRevision"] = int(post.get("contentRevision") or 1) + 1
            post["updatedAt"] = _utc_now_iso()
            changed = True
        if changed:
            _save_store({"posts": current})
