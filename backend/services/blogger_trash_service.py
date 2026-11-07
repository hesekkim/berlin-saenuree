from __future__ import annotations

import inspect
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from core.config import settings
from core.json_store import read_keyed_list, write_json_store
from core.store_lock import STORE_LOCK
from services.blogger_service import (
    BloggerConflictError,
    BloggerNotFoundError,
    BloggerPermissionError,
    _list_bloggers_unlocked,
    _save_store,
    can_mutate_blogger,
)
from services.rich_text import extract_file_ids, extract_image_ids
from services.published_status import normalize_published


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _load_store() -> dict[str, Any]:
    path = settings.blogger_trash_file
    items = [item for item in read_keyed_list(path, "items") if isinstance(item, dict)]
    changed = False
    for item in items:
        blogger = item.get("blogger")
        if not isinstance(blogger, dict):
            continue
        before = dict(blogger)
        normalize_published(blogger)
        changed = changed or blogger != before
    if changed:
        write_json_store(path, {"items": items})
    return {"items": items}


def _save_trash_store(store: dict[str, Any]) -> None:
    write_json_store(settings.blogger_trash_file, store)


def _parse_deleted_at(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_expired(item: dict[str, Any], now: datetime) -> bool:
    deleted_at = _parse_deleted_at(item.get("deletedAt"))
    if deleted_at is None:
        return False
    retention = timedelta(days=max(0, int(settings.blogger_trash_retention_days)))
    return now - deleted_at >= retention


def _with_expiration(item: dict[str, Any]) -> dict[str, Any]:
    deleted_at = _parse_deleted_at(item.get("deletedAt"))
    if deleted_at is None:
        return dict(item)
    return {
        **item,
        "expiresAt": (
            deleted_at + timedelta(days=max(0, int(settings.blogger_trash_retention_days)))
        ).isoformat(),
    }


def _media_ids(blogger: dict[str, Any]) -> tuple[set[str], set[str]]:
    file_ids: set[str] = set()
    image_ids: set[str] = set()
    for copy in (blogger.get("copies") or {}).values():
        if isinstance(copy, dict):
            body = str(copy.get("body") or "")
            file_ids.update(extract_file_ids(body))
            image_ids.update(extract_image_ids(body))
    return file_ids, image_ids


def list_trash_refs() -> set[str]:
    refs: set[str] = set()
    for item in _load_store().get("items") or []:
        blogger = item.get("blogger")
        if isinstance(blogger, dict):
            file_ids, image_ids = _media_ids(blogger)
            refs.update(file_ids)
            refs.update(image_ids)
    return refs


def _invoke_cleanup_media(file_ids: set[str], image_ids: set[str]) -> None:
    try:
        signature = inspect.signature(_cleanup_media)
    except (TypeError, ValueError):
        _cleanup_media(file_ids, image_ids)
        return
    if len(signature.parameters) == 1:
        _cleanup_media(file_ids | image_ids)
        return
    _cleanup_media(file_ids, image_ids)


def _purge_expired_locked() -> None:
    store = _load_store()
    expired = [item for item in store["items"] if _is_expired(item, _utc_now())]
    if not expired:
        return
    _save_trash_store({"items": [item for item in store["items"] if item not in expired]})
    for item in expired:
        blogger = item.get("blogger")
        if isinstance(blogger, dict):
            file_ids, image_ids = _media_ids(blogger)
            _invoke_cleanup_media(file_ids, image_ids)


def _visible(item: dict[str, Any], role: str, email: str) -> bool:
    if role in ("site_admin", "page_admin"):
        return True
    blogger = item.get("blogger") or {}
    return role == "page_manager" and _normalize_email(blogger.get("createdBy")) == _normalize_email(email)


def list_trash(*, role: str, email: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_locked()
        items = [item for item in _load_store()["items"] if _visible(item, role, email)]
        items.sort(key=lambda item: (str(item.get("deletedAt") or ""), str(item.get("id") or "")), reverse=True)
        return {"items": [_with_expiration(item) for item in items], "total": len(items)}


def move_to_trash(blogger_id: str, *, deleted_by: str, role: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_locked()
        current = _list_bloggers_unlocked()
        target = next((item for item in current if item["id"] == blogger_id), None)
        if target is None:
            raise BloggerNotFoundError("Blogger not found")
        if not can_mutate_blogger(role, _normalize_email(deleted_by), target):
            raise BloggerPermissionError("Cannot modify this blogger")
        record = {
            "id": str(uuid.uuid4()),
            "deletedAt": _utc_now_iso(),
            "deletedBy": _normalize_email(deleted_by),
            "blogger": dict(target),
        }
        store = _load_store()
        store["items"].append(record)
        _save_trash_store(store)
        _save_store({"bloggers": [item for item in current if item["id"] != blogger_id]})
        return record


def _get_item(store: dict[str, Any], trash_id: str) -> dict[str, Any]:
    item = next((entry for entry in store["items"] if entry.get("id") == trash_id), None)
    if item is None or not isinstance(item.get("blogger"), dict):
        raise BloggerNotFoundError("Trash item not found")
    return item


def _assert_access(item: dict[str, Any], role: str, email: str) -> dict[str, Any]:
    blogger = item["blogger"]
    if not _visible(item, role, email):
        raise BloggerPermissionError("Cannot modify this blogger")
    return blogger


def restore_trash_item(trash_id: str, *, role: str, email: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_locked()
        store = _load_store()
        item = _get_item(store, trash_id)
        blogger = _assert_access(item, role, email)
        if any(entry["id"] == blogger["id"] for entry in _list_bloggers_unlocked()):
            raise BloggerConflictError("Blogger already exists", blogger)
        restored = dict(blogger)
        restored["contentRevision"] = int(restored.get("contentRevision") or 1) + 1
        restored["updatedAt"] = _utc_now_iso()
        current = _list_bloggers_unlocked()
        current.append(restored)
        _save_store({"bloggers": current})
        _save_trash_store({"items": [entry for entry in store["items"] if entry.get("id") != trash_id]})
        return restored


def _cleanup_media(file_ids: set[str], image_ids: set[str] | None = None) -> None:
    if not file_ids and not (image_ids or set()):
        return
    from services.posts_service import _cleanup_unused_media

    _cleanup_unused_media(
        image_ids=set(image_ids or ()),
        file_ids=set(file_ids),
    )


def purge_trash_item(trash_id: str, *, role: str, email: str) -> dict[str, Any]:
    with STORE_LOCK:
        _purge_expired_locked()
        store = _load_store()
        item = _get_item(store, trash_id)
        blogger = _assert_access(item, role, email)
        _save_trash_store({"items": [entry for entry in store["items"] if entry.get("id") != trash_id]})
        file_ids, image_ids = _media_ids(blogger)
        _invoke_cleanup_media(file_ids, image_ids)
        return item


def purge_expired_trash() -> None:
    with STORE_LOCK:
        _purge_expired_locked()


def remove_language_from_all_blogger_trash(language: str) -> None:
    code = str(language).strip()
    if not code:
        return
    with STORE_LOCK:
        store = _load_store()
        changed = False
        for item in store["items"]:
            blogger = item.get("blogger")
            if not isinstance(blogger, dict):
                continue
            copies = blogger.get("copies") or {}
            if code not in copies:
                continue
            blogger["copies"] = {key: value for key, value in copies.items() if key != code}
            changed = True
        if changed:
            _save_trash_store(store)
