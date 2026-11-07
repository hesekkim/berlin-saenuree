from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from core.config import settings
from core.json_store import read_keyed_list, write_json_store
from core.store_lock import STORE_LOCK
from services.image_optimize_service import (
    ImageOptimizeNotFoundError,
    get_image_variant,
)
from services.media_files_service import MediaFilesNotFoundError, get_file_record
from services.media_refs import (
    cleanup_unused_media,
    normalize_media_id,
    refs_from_copies,
)
from services.popup_rich_text import copy_has_text, migrate_popup_copy
from services.rich_text import MAX_RICH_HTML_LENGTH

MAX_POPUPS = 4
MAX_POPUP_NAME_LENGTH = 80
DEFAULT_NOTICE_BACKGROUND = "#252830"
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
POPUP_TYPES = frozenset({"poster", "notice"})
LEGACY_TYPE_MAP = {"image": "poster"}



class PopupsError(Exception):
    pass


class PopupsValidationError(PopupsError):
    pass


class PopupsNotFoundError(PopupsError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_optional_datetime(value: object, field_name: str) -> str | None:
    if value is None or value == "":
        return None
    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise PopupsValidationError(f"Invalid {field_name}") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    # Keep microseconds so local end-of-day 23:59:59.999 is not truncated.
    return parsed.astimezone(timezone.utc).isoformat()


def _parse_stored_datetime(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _load_store() -> dict[str, Any]:
    popups = read_keyed_list(settings.popups_file, "popups")
    return {"popups": [item for item in popups if isinstance(item, dict)]}


def _save_store(store: dict[str, Any]) -> None:
    write_json_store(settings.popups_file, store)

def _normalize_copies(
    raw: object, *, max_length: int | None = None
) -> dict[str, dict[str, str]]:
    if not isinstance(raw, dict):
        return {}
    copies: dict[str, dict[str, str]] = {}
    for language, value in raw.items():
        code = str(language).strip()
        if not code or not isinstance(value, dict):
            continue
        copies[code] = migrate_popup_copy(value, max_length=max_length)
    return copies


def _normalize_name(raw: object) -> str:
    return str(raw or "").strip()[:MAX_POPUP_NAME_LENGTH]


def _normalize_background_color(raw: object, *, popup_type: str) -> str | None:
    if popup_type != "notice":
        return None
    text = str(raw or "").strip()
    if not text:
        return DEFAULT_NOTICE_BACKGROUND
    if not HEX_COLOR_RE.match(text):
        raise PopupsValidationError("backgroundColor must be #RRGGBB")
    return text.lower()


def _normalize_popup(raw: dict[str, Any]) -> dict[str, Any] | None:
    popup_id = str(raw.get("id") or "").strip()
    popup_type = str(raw.get("type") or "").strip()
    popup_type = LEGACY_TYPE_MAP.get(popup_type, popup_type)
    if not popup_id or popup_type not in POPUP_TYPES:
        return None
    try:
        sort_order = int(raw.get("sortOrder", 0))
        content_revision = int(raw.get("contentRevision", 1))
    except (TypeError, ValueError):
        return None
    image_id = raw.get("imageId")
    source_file_id = raw.get("sourceFileId")
    background_raw = str(raw.get("backgroundColor") or "").strip()
    if popup_type == "notice":
        if background_raw and HEX_COLOR_RE.match(background_raw):
            background_color = background_raw.lower()
        else:
            background_color = DEFAULT_NOTICE_BACKGROUND
    else:
        background_color = None
    return {
        "id": popup_id,
        "name": _normalize_name(raw.get("name")),
        "type": popup_type,
        "enabled": bool(raw.get("enabled", True)),
        "sortOrder": sort_order,
        "startsAt": raw.get("startsAt") or None,
        "endsAt": raw.get("endsAt") or None,
        "contentRevision": max(1, content_revision),
        "imageId": str(image_id).strip() if image_id else None,
        "sourceFileId": str(source_file_id).strip() if source_file_id else None,
        "backgroundColor": background_color,
        "copies": _normalize_copies(raw.get("copies")),
    }


def list_popups() -> list[dict[str, Any]]:
    with STORE_LOCK:
        store = _load_store()
        items = [
            normalized
            for item in store["popups"]
            if (normalized := _normalize_popup(item)) is not None
        ]
        return sorted(items, key=lambda item: (item["sortOrder"], item["id"]))


def _assert_media_refs(
    image_id: str | None,
    source_file_id: str | None,
    *,
    check_source: bool = True,
) -> None:
    image_source = ""
    if image_id:
        try:
            record = get_image_variant(image_id, "display")
        except ImageOptimizeNotFoundError as error:
            raise PopupsValidationError("imageId not found") from error
        image_source = normalize_media_id(record["meta"].get("sourceFileId"))

    if not source_file_id or not check_source:
        return
    try:
        get_file_record(source_file_id)
    except MediaFilesNotFoundError as error:
        raise PopupsValidationError("sourceFileId not found") from error
    if image_source and image_source != normalize_media_id(source_file_id):
        raise PopupsValidationError("sourceFileId does not match image")


def list_popup_media_refs() -> set[str]:
    """Media ids referenced by popups (image, source file, notice body)."""
    refs: set[str] = set()
    for popup in list_popups():
        for value in (popup.get("imageId"), popup.get("sourceFileId")):
            if value:
                refs.add(str(value))
        refs.update(refs_from_copies(popup.get("copies")))
    return refs


def _validate_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    if not partial or "type" in payload:
        popup_type = str(payload.get("type") or "").strip()
        popup_type = LEGACY_TYPE_MAP.get(popup_type, popup_type)
        if popup_type not in POPUP_TYPES:
            raise PopupsValidationError("type must be poster or notice")
    else:
        popup_type = None

    result: dict[str, Any] = {}
    if popup_type is not None:
        result["type"] = popup_type

    if not partial or "name" in payload:
        name = _normalize_name(payload.get("name"))
        if not name:
            raise PopupsValidationError("name is required")
        result["name"] = name

    if not partial or "enabled" in payload:
        result["enabled"] = bool(payload.get("enabled", True))

    if not partial or "startsAt" in payload:
        result["startsAt"] = _parse_optional_datetime(
            payload.get("startsAt"), "startsAt"
        )
    if not partial or "endsAt" in payload:
        result["endsAt"] = _parse_optional_datetime(payload.get("endsAt"), "endsAt")

    if result.get("startsAt") and result.get("endsAt"):
        if result["startsAt"] > result["endsAt"]:
            raise PopupsValidationError("startsAt must be before endsAt")

    if not partial or "copies" in payload:
        result["copies"] = _normalize_copies(
            payload.get("copies"), max_length=MAX_RICH_HTML_LENGTH
        )

    if not partial or "imageId" in payload:
        image_id = payload.get("imageId")
        result["imageId"] = str(image_id).strip() if image_id else None

    if not partial or "sourceFileId" in payload:
        source_file_id = payload.get("sourceFileId")
        result["sourceFileId"] = (
            str(source_file_id).strip() if source_file_id else None
        )

    effective_type = result.get("type")
    if effective_type == "notice":
        result["backgroundColor"] = _normalize_background_color(
            payload.get("backgroundColor"),
            popup_type="notice",
        )
    elif effective_type == "poster":
        result["backgroundColor"] = None

    if effective_type == "poster" and not result.get("imageId"):
        raise PopupsValidationError("poster type requires imageId")
    if effective_type == "notice":
        copies = result.get("copies") or {}
        if not _copies_have_text(copies) and not partial:
            raise PopupsValidationError("notice type requires body")

    return result


def _content_fingerprint(popup: dict[str, Any]) -> str:
    return json.dumps(
        {
            "name": popup.get("name") or "",
            "type": popup.get("type"),
            "imageId": popup.get("imageId"),
            "backgroundColor": popup.get("backgroundColor"),
            "copies": popup.get("copies") or {},
        },
        sort_keys=True,
        ensure_ascii=False,
    )


def _cleanup_media(
    *,
    image_id: str | None,
    source_file_id: str | None,
) -> None:
    cleanup_unused_media(
        image_ids={image_id} if image_id else set(),
        file_ids={source_file_id} if source_file_id else set(),
    )

def _copies_have_text(copies: object) -> bool:
    if not isinstance(copies, dict):
        return False
    return any(copy_has_text(copy) for copy in copies.values())


def _has_displayable_content(popup: dict[str, Any]) -> bool:
    """Home must never get an empty dim overlay (no image and no text)."""
    if popup.get("imageId"):
        return True
    if popup.get("type") == "notice":
        return _copies_have_text(popup.get("copies") or {})
    return False


def is_published(popup: dict[str, Any], *, now: datetime | None = None) -> bool:
    if not popup.get("enabled"):
        return False
    if not _has_displayable_content(popup):
        return False
    current = now or _utc_now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    starts_at = popup.get("startsAt")
    ends_at = popup.get("endsAt")
    if starts_at:
        start = _parse_stored_datetime(starts_at)
        if start is None:
            return False
        if start > current:
            return False
    if ends_at:
        end = _parse_stored_datetime(ends_at)
        if end is None:
            return False
        if end < current:
            return False
    return True


def list_published_popups(*, now: datetime | None = None) -> list[dict[str, Any]]:
    return [
        popup
        for popup in list_popups()
        if is_published(popup, now=now)
    ]


def to_published_response(popup: dict[str, Any]) -> dict[str, Any]:
    """Public home payload — omit admin-only fields (name, sourceFileId, etc.)."""
    return {
        "id": popup["id"],
        "type": popup["type"],
        "sortOrder": popup["sortOrder"],
        "imageId": popup.get("imageId"),
        "backgroundColor": popup.get("backgroundColor"),
        "copies": popup.get("copies") or {},
    }


def get_popup(popup_id: str) -> dict[str, Any]:
    for popup in list_popups():
        if popup["id"] == popup_id:
            return popup
    raise PopupsNotFoundError("Popup not found")


def create_popup(payload: dict[str, Any]) -> dict[str, Any]:
    with STORE_LOCK:
        current = list_popups()
        if len(current) >= MAX_POPUPS:
            raise PopupsValidationError(f"At most {MAX_POPUPS} popups are allowed")

        data = _validate_payload(payload, partial=False)
        _assert_media_refs(data.get("imageId"), data.get("sourceFileId"))
        if data["type"] == "poster" and not data.get("imageId"):
            raise PopupsValidationError("poster type requires imageId")
        if data["type"] == "notice" and not _copies_have_text(data["copies"]):
            raise PopupsValidationError("notice type requires body")

        next_order = max((item["sortOrder"] for item in current), default=-1) + 1
        popup = {
            "id": str(uuid.uuid4()),
            "name": data["name"],
            "type": data["type"],
            "enabled": data["enabled"],
            "sortOrder": next_order,
            "startsAt": data["startsAt"],
            "endsAt": data["endsAt"],
            "contentRevision": 1,
            "imageId": data.get("imageId"),
            "sourceFileId": data.get("sourceFileId"),
            "backgroundColor": data.get("backgroundColor"),
            "copies": data.get("copies") or {},
        }
        current.append(popup)
        _save_store({"popups": current})
        return popup


def reorder_popups(ordered_ids: list[str]) -> list[dict[str, Any]]:
    with STORE_LOCK:
        current = list_popups()
        by_id = {popup["id"]: popup for popup in current}
        if len(ordered_ids) != len(by_id) or set(ordered_ids) != set(by_id):
            raise PopupsValidationError(
                "orderedIds must list every popup id exactly once"
            )
        if len(ordered_ids) != len(set(ordered_ids)):
            raise PopupsValidationError("orderedIds must not contain duplicates")

        reordered: list[dict[str, Any]] = []
        for index, popup_id in enumerate(ordered_ids):
            popup = dict(by_id[popup_id])
            popup["sortOrder"] = index
            reordered.append(popup)
        _save_store({"popups": reordered})
        return list_popups()


def update_popup(popup_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    with STORE_LOCK:
        current = list_popups()
        index = next(
            (i for i, item in enumerate(current) if item["id"] == popup_id), None
        )
        if index is None:
            raise PopupsNotFoundError("Popup not found")

        existing = current[index]
        # Type is immutable — validate as the stored type so a client cannot
        # fail poster image rules by sending a different type in the payload.
        data = _validate_payload(
            {**existing, **payload, "type": existing["type"]},
            partial=False,
        )
        previous_image_id = existing.get("imageId")
        previous_file_id = existing.get("sourceFileId")
        # Legacy popups may carry stale ids; only re-verify the source when it moved.
        _assert_media_refs(
            data.get("imageId"),
            data.get("sourceFileId"),
            check_source=(
                data.get("imageId") != previous_image_id
                or data.get("sourceFileId") != previous_file_id
            ),
        )

        # sortOrder is owned by reorder API only — never overwrite from edit form.
        updated = {
            **existing,
            **data,
            "id": existing["id"],
            "type": existing["type"],
            "sortOrder": existing["sortOrder"],
            "contentRevision": existing["contentRevision"],
        }
        if _content_fingerprint(updated) != _content_fingerprint(existing):
            updated["contentRevision"] = int(existing["contentRevision"]) + 1

        current[index] = updated
        _save_store({"popups": current})

        _cleanup_media(
            image_id=(
                previous_image_id
                if previous_image_id != updated.get("imageId")
                else None
            ),
            source_file_id=(
                previous_file_id
                if previous_file_id != updated.get("sourceFileId")
                else None
            ),
        )

        return updated


def delete_popup(popup_id: str) -> None:
    with STORE_LOCK:
        current = list_popups()
        target = next((item for item in current if item["id"] == popup_id), None)
        if target is None:
            raise PopupsNotFoundError("Popup not found")

        remaining = [item for item in current if item["id"] != popup_id]
        _save_store({"popups": remaining})
        _cleanup_media(
            image_id=target.get("imageId"),
            source_file_id=target.get("sourceFileId"),
        )


def remove_language_from_all_popups(language: str) -> None:
    code = str(language).strip()
    if not code:
        return
    with STORE_LOCK:
        current = list_popups()
        changed = False
        for popup in current:
            copies = popup.get("copies") or {}
            if code not in copies:
                continue
            copies = dict(copies)
            del copies[code]
            popup["copies"] = copies
            popup["contentRevision"] = int(popup.get("contentRevision") or 1) + 1
            # Notice requires body text; if cascade emptied all text, unpublish.
            if (
                popup.get("type") == "notice"
                and popup.get("enabled")
                and not _copies_have_text(copies)
            ):
                popup["enabled"] = False
            changed = True
        if changed:
            _save_store({"popups": current})
