"""Single source of truth for live media references and unused-media cleanup.

Every feature that stores a media reference (posts, blogger, drafts, trash,
popups) must be reflected in `collect_active_media_refs`. Any code path that
deletes media must consult it first.
"""

from __future__ import annotations

import logging
from typing import Iterable

from core.json_store import JsonStoreCorruptError
from core.store_lock import STORE_LOCK
from services.image_optimize_service import ImageOptimizeNotFoundError, delete_derivatives
from services.media_files_service import MediaFilesNotFoundError, delete_file
from services.rich_text import extract_media_ids

logger = logging.getLogger(__name__)


def normalize_media_id(value: object) -> str:
    return str(value or "").strip().lower()


def refs_from_copies(copies: object) -> set[str]:
    """Media ids embedded in rich-text `body` fields of language copies."""
    refs: set[str] = set()
    if not isinstance(copies, dict):
        return refs
    for copy in copies.values():
        if isinstance(copy, dict):
            refs.update(extract_media_ids(str(copy.get("body") or "")))
    return refs


def collect_active_media_refs() -> set[str]:
    """Lowercased imageId / sourceFileId / file id values that must not be deleted.

    Errors propagate on purpose: an incomplete reference set would let callers
    delete live media.
    """
    from services import (
        blogger_draft_service,
        blogger_service,
        blogger_trash_service,
        page_content_service,
        popups_service,
        posts_service,
        posts_trash_service,
    )

    refs: set[str] = set()
    refs.update(posts_service.list_post_media_refs())
    refs.update(posts_trash_service.list_trash_refs())
    refs.update(blogger_service.active_media_refs())
    refs.update(blogger_trash_service.list_trash_refs())
    refs.update(blogger_draft_service.list_draft_media_ids())
    refs.update(popups_service.list_popup_media_refs())
    refs.update(page_content_service.get_home_media_refs())
    refs.update(page_content_service.get_church_history_media_refs())
    return {normalize_media_id(ref) for ref in refs if ref}


def is_media_referenced(media_id: str) -> bool:
    return normalize_media_id(media_id) in collect_active_media_refs()


def cleanup_unused_media(
    *,
    image_ids: Iterable[str],
    file_ids: Iterable[str],
) -> None:
    """Delete media that no stored document references anymore (best-effort)."""
    candidate_images = {normalize_media_id(item) for item in image_ids if item}
    candidate_files = {normalize_media_id(item) for item in file_ids if item}
    if not candidate_images and not candidate_files:
        return

    # Re-check references and delete under one lock so a concurrent save cannot
    # start referencing a candidate between the check and the delete.
    with STORE_LOCK:
        try:
            live = collect_active_media_refs()
        except JsonStoreCorruptError as error:
            logger.error("Skipping media cleanup, reference stores unreadable: %s", error)
            return
        for image_id in candidate_images:
            if image_id in live:
                continue
            try:
                delete_derivatives(image_id)
            except ImageOptimizeNotFoundError:
                pass
            except Exception as error:  # noqa: BLE001
                logger.warning("Failed to delete image %s: %s", image_id, error)

        for file_id in candidate_files:
            if file_id in live:
                continue
            try:
                delete_file(file_id)
            except MediaFilesNotFoundError:
                pass
            except Exception as error:  # noqa: BLE001
                logger.warning("Failed to delete file %s: %s", file_id, error)
