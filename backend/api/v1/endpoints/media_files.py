from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.v1.endpoints.auth import get_current_cms_user
from models.media import MediaFileResponse
from services.media_access_service import (
    MediaDeleteForbiddenError,
    MediaInUseError,
    delete_media_file,
)
from services.media_files_service import (
    MediaFilesError,
    MediaFilesNotFoundError,
    MediaFilesValidationError,
    get_file_record,
    must_force_attachment,
    normalize_original_name,
    read_upload_limited,
    resolve_max_size_bytes,
    save_file,
    served_content_type,
)

router = APIRouter()


def _http_error(error: MediaFilesError) -> HTTPException:
    if isinstance(error, MediaFilesNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )
    if isinstance(error, MediaFilesValidationError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(error),
    )


@router.post("/files", response_model=MediaFileResponse)
async def upload_media_file(
    file: UploadFile = File(...),
    accept: str | None = Query(
        default=None,
        description="Comma-separated MIME and/or extension patterns",
    ),
    max_size_bytes: int | None = Query(
        default=None,
        ge=1,
        description="Per-request size cap (cannot exceed server default)",
    ),
    user: dict = Depends(get_current_cms_user),
):
    try:
        limit = resolve_max_size_bytes(max_size_bytes)
        content = await read_upload_limited(file, limit)
        saved = await run_in_threadpool(
            save_file,
            content,
            original_name=file.filename or "file",
            content_type=file.content_type,
            max_size_bytes=limit,
            accept=accept,
            uploaded_by=user["email"],
        )
    except MediaFilesError as error:
        raise _http_error(error) from error

    return MediaFileResponse.model_validate(saved)


@router.get("/files/{file_id}")
async def download_media_file(
    file_id: str,
    download: bool = Query(
        default=False,
        description="If true, Content-Disposition is attachment",
    ),
):
    """Public by design: UUID obscurity + upload restricted to CMS users."""
    try:
        record = get_file_record(file_id)
    except MediaFilesError as error:
        raise _http_error(error) from error

    meta = record["meta"]
    original_name = normalize_original_name(
        str(meta.get("originalName") or "file")
    )
    stored_content_type = str(meta.get("contentType") or "")
    content_type = served_content_type(stored_content_type)
    force_attachment = download or must_force_attachment(stored_content_type)

    # Let FileResponse own Content-Disposition once. A second manual header
    # plus disk name like original.pdf can make browsers save *.pdf.pdf.
    response = FileResponse(
        path=record["path"],
        media_type=content_type,
        filename=original_name,
        content_disposition_type="attachment" if force_attachment else "inline",
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_media_file(
    file_id: str,
    user: dict = Depends(get_current_cms_user),
):
    try:
        delete_media_file(file_id, role=user["role"], email=user["email"])
    except MediaDeleteForbiddenError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error
    except MediaInUseError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error
    except MediaFilesError as error:
        raise _http_error(error) from error
