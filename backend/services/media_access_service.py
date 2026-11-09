"""Authorization and reference checks for deleting uploaded media via the API."""

from __future__ import annotations

from services.image_optimize_service import (
    delete_derivatives,
    derived_image_ids_for_source,
    get_image_variant,
)
from services.media_files_service import (
    delete_file,
    get_file_record,
    normalize_uploader,
)
from services.media_refs import cleanup_unused_media, is_media_referenced


class MediaInUseError(Exception):
    """Media is referenced by stored content and must not be deleted."""


class MediaDeleteForbiddenError(Exception):
    """Actor is not allowed to delete this media."""


def can_delete_media(*, role: str, email: str, uploaded_by: object) -> bool:
    """site_admin may delete any media; others only what they uploaded themselves."""
    if role == "site_admin":
        return True
    owner = normalize_uploader(str(uploaded_by or ""))
    return bool(owner) and owner == normalize_uploader(email)


def _assert_deletable(
    *, media_id: str, role: str, email: str, uploaded_by: object
) -> None:
    if not can_delete_media(role=role, email=email, uploaded_by=uploaded_by):
        raise MediaDeleteForbiddenError("Cannot delete this media")
    if is_media_referenced(media_id):
        raise MediaInUseError("Media is in use")


def delete_media_file(file_id: str, *, role: str, email: str) -> None:
    record = get_file_record(file_id)
    meta = record["meta"]
    _assert_deletable(
        media_id=str(meta.get("id") or file_id),
        role=role,
        email=email,
        uploaded_by=meta.get("uploadedBy"),
    )
    cleanup_unused_media(
        image_ids=derived_image_ids_for_source(file_id),
        file_ids=[],
    )
    delete_file(file_id)


def delete_media_image(image_id: str, *, role: str, email: str) -> None:
    record = get_image_variant(image_id, "display")
    meta = record["meta"]
    _assert_deletable(
        media_id=str(meta.get("id") or image_id),
        role=role,
        email=email,
        uploaded_by=meta.get("uploadedBy"),
    )
    delete_derivatives(image_id)
