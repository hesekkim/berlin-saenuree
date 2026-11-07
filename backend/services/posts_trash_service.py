from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from core.config import settings
from core.json_store import read_keyed_list, write_json_store
from core.store_lock import STORE_LOCK
from services import posts_service
from services.media_refs import refs_from_copies
from services.posts_service import (
    PostsConflictError,
    PostsNotFoundError,
    PostsPermissionError,
    _cleanup_unused_media,
    _list_posts_unlocked,
    _media_ids_from_post,
)
from services.published_status import normalize_published


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _load_store() -> dict[str, Any]:
    path = settings.posts_trash_file
    normalized_items = [
        item for item in read_keyed_list(path, "items") if isinstance(item, dict)
    ]
    changed = False
    for item in normalized_items:
        post = item.get("post")
        if not isinstance(post, dict):
            continue
        before = dict(post)
        normalize_published(post)
        changed = changed or post != before
    if changed:
        write_json_store(path, {"items": normalized_items})
    return {"items": normalized_items}


def _save_trash_store(store: dict[str, Any]) -> None:
    write_json_store(settings.posts_trash_file, store)


def _parse_deleted_at(value: object) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_expired(item: dict[str, Any], *, now: datetime) -> bool:
    deleted_at = _parse_deleted_at(item.get("deletedAt"))
    if deleted_at is None:
        return False
    retention = timedelta(days=max(0, int(settings.posts_trash_retention_days)))
    return now - deleted_at >= retention


def _with_expiration(item: dict[str, Any]) -> dict[str, Any]:
    deleted_at = _parse_deleted_at(item.get("deletedAt"))
    if deleted_at is None:
        return dict(item)
    expires_at = deleted_at + timedelta(
        days=max(0, int(settings.posts_trash_retention_days))
    )
    return {**item, "expiresAt": expires_at.isoformat()}


def _purge_expired_trash_locked() -> None:
    store = _load_store()
    items = store.get("items") or []
    now = _utc_now()
    kept: list[dict[str, Any]] = []
    expired: list[dict[str, Any]] = []
    for item in items:
        if _is_expired(item, now=now):
            expired.append(item)
        else:
            kept.append(item)
    if not expired:
        return
    _save_trash_store({"items": kept})
    for item in expired:
        post = item.get("post") or {}
        if not isinstance(post, dict):
            continue
        image_ids, file_ids = _media_ids_from_post(post)
        _cleanup_unused_media(image_ids=image_ids, file_ids=file_ids)


def _viewable_trash_items(
    items: list[dict[str, Any]],
    *,
    role: str,
    email: str,
) -> list[dict[str, Any]]:
    if role in ("site_admin", "page_admin"):
        return list(items)
    if role != "page_manager":
        return []
    target = _normalize_email(email)
    visible: list[dict[str, Any]] = []
    for item in items:
        post = item.get("post") or {}
        if not isinstance(post, dict):
            continue
        if _normalize_email(post.get("createdBy")) == target:
            visible.append(item)
    return visible


def list_trash_refs() -> set[str]:
    refs: set[str] = set()
    for item in _load_store().get("items") or []:
        post = item.get("post") or {}
        if not isinstance(post, dict):
            continue
        image_ids, file_ids = _media_ids_from_post(post)
        refs.update(image_ids)
        refs.update(file_ids)
        refs.update(refs_from_copies(post.get("copies")))
    return refs


def list_trash(*, role: str, email: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_trash_locked()
        items = _viewable_trash_items(
            _load_store().get("items") or [],
            role=role,
            email=email,
        )
        items = sorted(
            items,
            key=lambda item: (
                str(item.get("deletedAt") or ""),
                str(item.get("id") or ""),
            ),
            reverse=True,
        )
        return {
            "items": [_with_expiration(item) for item in items],
            "total": len(items),
        }


def move_to_trash(post_id: str, *, deleted_by: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_trash_locked()
        current = _list_posts_unlocked()
        target = next((item for item in current if item["id"] == post_id), None)
        if target is None:
            raise PostsNotFoundError("Post not found")

        record = {
            "id": str(uuid.uuid4()),
            "deletedAt": _utc_now_iso(),
            "deletedBy": _normalize_email(deleted_by),
            "post": dict(target),
        }
        trash_store = _load_store()
        trash_store["items"].append(record)
        _save_trash_store(trash_store)

        remaining = [item for item in current if item["id"] != post_id]
        posts_service._save_store({"posts": remaining})
        return record


def restore_trash_item(trash_id: str, *, role: str, email: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_trash_locked()
        store = _load_store()
        item = next((entry for entry in store.get("items") or [] if entry.get("id") == trash_id), None)
        if item is None:
            raise PostsNotFoundError("Trash item not found")

        post = item.get("post") or {}
        if not isinstance(post, dict):
            raise PostsNotFoundError("Trash item not found")
        if role not in ("site_admin", "page_admin") and (
            role != "page_manager"
            or _normalize_email(post.get("createdBy")) != _normalize_email(email)
        ):
            raise PostsPermissionError("Cannot restore this post")

        live_posts = _list_posts_unlocked()
        live_match = next((entry for entry in live_posts if entry["id"] == post["id"]), None)
        if live_match is not None:
            raise PostsConflictError("Post already exists", dict(live_match))

        restored = dict(post)
        restored["contentRevision"] = int(restored.get("contentRevision") or 1) + 1
        restored["updatedAt"] = _utc_now_iso()

        current = _list_posts_unlocked()
        current.append(restored)
        posts_service._save_store({"posts": current})

        updated_items = [entry for entry in (store.get("items") or []) if entry.get("id") != trash_id]
        _save_trash_store({"items": updated_items})
        return restored


def purge_trash_item(trash_id: str, *, role: str, email: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_trash_locked()
        store = _load_store()
        item = next((entry for entry in store.get("items") or [] if entry.get("id") == trash_id), None)
        if item is None:
            raise PostsNotFoundError("Trash item not found")

        post = item.get("post") or {}
        if not isinstance(post, dict):
            raise PostsNotFoundError("Trash item not found")
        if role not in ("site_admin", "page_admin") and (
            role != "page_manager"
            or _normalize_email(post.get("createdBy")) != _normalize_email(email)
        ):
            raise PostsPermissionError("Cannot delete this post from trash")

        image_ids, file_ids = _media_ids_from_post(post)
        remaining = [entry for entry in (store.get("items") or []) if entry.get("id") != trash_id]
        _save_trash_store({"items": remaining})
        _cleanup_unused_media(image_ids=image_ids, file_ids=file_ids)
        return item


def purge_expired_trash() -> None:
    with STORE_LOCK:
        _purge_expired_trash_locked()
