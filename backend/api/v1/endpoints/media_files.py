import tempfile
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from models.media import MediaFileResponse
from services.media_access_service import (
    MediaDeleteForbiddenError,
    MediaInUseError,
    delete_media_file,
)
from services.media_files_service import (
    DEFAULT_CONTENT_TYPE,
    MediaFilesError,
    MediaFilesNotFoundError,
    MediaFilesValidationError,
    copy_upload_limited,
    copy_stream_limited,
    get_file_record,
    must_force_attachment,
    normalize_content_type,
    normalize_original_name,
    read_upload_limited,
    resolve_max_size_bytes,
    save_file,
    save_file_from_path,
    served_content_type,
    sniff_content_type,
    VIDEO_UPLOAD_TEMP_PREFIX,
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
    request: Request,
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
        content_type = normalize_content_type(file.content_type)
        is_video = content_type == "video/mp4" or (
            file.filename or ""
        ).lower().endswith(".mp4")
        if is_video:
            content_type = "video/mp4"
            with tempfile.TemporaryDirectory(
                prefix=VIDEO_UPLOAD_TEMP_PREFIX,
                dir=settings.media_upload_temp_dir,
            ) as temp_dir:
                source_path = Path(temp_dir) / "source.mp4"
                await copy_upload_limited(file, source_path, limit)
                await file.close()
                if await request.is_disconnected():
                    raise HTTPException(
                        status_code=499,
                        detail="Upload was cancelled",
                    )
                saved = await run_in_threadpool(
                    save_file_from_path,
                    source_path,
                    original_name=file.filename or "file",
                    content_type=content_type,
                    max_size_bytes=limit,
                    accept=accept,
                    uploaded_by=user["email"],
                )
        else:
            content = await read_upload_limited(file, limit)
            if (
                content_type == DEFAULT_CONTENT_TYPE
                and sniff_content_type(content) == "video/mp4"
            ):
                content_type = "video/mp4"
            saved = await run_in_threadpool(
                save_file,
                content,
                original_name=file.filename or "file",
                content_type=content_type,
                max_size_bytes=limit,
                accept=accept,
                uploaded_by=user["email"],
            )
    except MediaFilesError as error:
        raise _http_error(error) from error

    return MediaFileResponse.model_validate(saved)


@router.post("/files/video", response_model=MediaFileResponse)
async def upload_video_file(
    request: Request,
    filename: str = Query(..., min_length=1),
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
        with tempfile.TemporaryDirectory(
            prefix=VIDEO_UPLOAD_TEMP_PREFIX,
            dir=settings.media_upload_temp_dir,
        ) as temp_dir:
            source_path = Path(temp_dir) / "source.mp4"
            await copy_stream_limited(request.stream(), source_path, limit)
            if await request.is_disconnected():
                raise HTTPException(
                    status_code=499,
                    detail="Upload was cancelled",
                )
            saved = await run_in_threadpool(
                save_file_from_path,
                source_path,
                original_name=filename,
                content_type="video/mp4",
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
