from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from api.v1.endpoints.auth import require_page_editor
from models import (
    ChurchHistorySharedMedia,
    HomeSharedMedia,
    PageContentResponse,
    PageContentUpdateRequest,
    VisitSharedMedia,
)
from services import page_content_service
from services.page_content_service import PageContentConflictError, PageDocument


router = APIRouter()


def _to_response(slug: str, document: PageDocument) -> PageContentResponse:
    return PageContentResponse(
        slug=slug,
        contentRevision=document.revision,
        content=document.content,
        sharedMedia=(
            HomeSharedMedia(**document.shared_media)
            if slug == "home"
            else (
                ChurchHistorySharedMedia(**document.shared_media)
                if slug == "church-history"
                else (
                    VisitSharedMedia(**document.shared_media)
                    if slug == "visit" and document.shared_media
                    else None
                )
            )
        ),
    )


@router.get(
    "/church-history/public",
    response_model=PageContentResponse,
    response_model_exclude_unset=True,
)
async def get_public_church_history():
    document = page_content_service.get_church_history_public_document()
    return PageContentResponse(
        slug="church-history",
        contentRevision=document.revision,
        content=document.content,
    )


@router.get(
    "/{slug}",
    response_model=PageContentResponse,
    response_model_exclude_unset=True,
)
async def get_page(slug: str):
    if not page_content_service.is_allowed_slug(slug):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Page not found",
        )

    return _to_response(slug, page_content_service.get_page_document(slug))


@router.put(
    "/{slug}",
    response_model=PageContentResponse,
    response_model_exclude_unset=True,
)
async def put_page(
    slug: str,
    request: PageContentUpdateRequest,
    _user: dict = Depends(require_page_editor),
):
    if not page_content_service.is_allowed_slug(slug):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Page not found",
        )

    try:
        saved = page_content_service.save_page_content(
            slug,
            {
                language: copy.model_dump(exclude_unset=True)
                for language, copy in request.content.items()
            },
            expected_revision=request.contentRevision,
            shared_media=(
                request.sharedMedia.model_dump(exclude_unset=True)
                if request.sharedMedia is not None
                else None
            ),
        )
    except PageContentConflictError as error:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_to_response(slug, error.current).model_dump(exclude_unset=True),
        )
    return _to_response(slug, saved)
