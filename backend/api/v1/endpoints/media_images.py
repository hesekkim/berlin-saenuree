from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.v1.endpoints.auth import get_current_cms_user
from models.media import OptimizeImageRequest, OptimizedImageResponse
from services.media_access_service import (
    MediaDeleteForbiddenError,
    MediaInUseError,
    delete_media_image,
)
from services.image_optimize_service import (
    ImageOptimizeError,
    ImageOptimizeNotFoundError,
    ImageOptimizeValidationError,
    get_image_variant,
    optimize_from_file_id,
)

router = APIRouter()

ImageVariantPath = Literal["display", "thumb"]

# Public derivatives are immutable WebP; allow browser/CDN caching.
_VARIANT_CACHE_CONTROL = "public, max-age=31536000, immutable"


def _http_error(error: ImageOptimizeError) -> HTTPException:
    if isinstance(error, ImageOptimizeNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )
    if isinstance(error, ImageOptimizeValidationError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(error),
    )


@router.post("/images/optimize", response_model=OptimizedImageResponse)
async def optimize_media_image(
    body: OptimizeImageRequest,
    user: dict = Depends(get_current_cms_user),
):
    try:
        result = await run_in_threadpool(
            optimize_from_file_id,
            body.fileId,
            variants=body.variants,
            uploaded_by=user["email"],
        )
    except ImageOptimizeError as error:
        raise _http_error(error) from error
    return OptimizedImageResponse.model_validate(result)


@router.get("/images/{image_id}/{variant}")
async def get_optimized_image(
    image_id: str,
    variant: ImageVariantPath,
):
    """Public by design: UUID obscurity + optimize restricted to CMS users."""
    try:
        record = await run_in_threadpool(get_image_variant, image_id, variant)
    except ImageOptimizeError as error:
        raise _http_error(error) from error

    response = FileResponse(
        path=record["path"],
        media_type=record["mediaType"],
        filename=record["filename"],
        content_disposition_type="inline",
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = _VARIANT_CACHE_CONTROL
    return response


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_optimized_image(
    image_id: str,
    user: dict = Depends(get_current_cms_user),
):
    # Runs on the event loop on purpose: the reference check and the delete must
    # not interleave with other requests that save content.
    try:
        delete_media_image(image_id, role=user["role"], email=user["email"])
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
    except ImageOptimizeError as error:
        raise _http_error(error) from error
