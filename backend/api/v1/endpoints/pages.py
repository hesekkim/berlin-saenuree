from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from api.v1.endpoints.auth import require_page_editor
from models import PageContentResponse, PageContentUpdateRequest
from services import page_content_service
from services.page_content_service import PageContentConflictError, PageDocument


router = APIRouter()


def _to_response(slug: str, document: PageDocument) -> PageContentResponse:
    return PageContentResponse(
        slug=slug,
        contentRevision=document.revision,
        content=document.content,
    )


@router.get("/{slug}", response_model=PageContentResponse)
async def get_page(slug: str):
    if not page_content_service.is_allowed_slug(slug):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Page not found",
        )

    return _to_response(slug, page_content_service.get_page_document(slug))


@router.put("/{slug}", response_model=PageContentResponse)
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
                language: copy.model_dump()
                for language, copy in request.content.items()
            },
            expected_revision=request.contentRevision,
        )
    except PageContentConflictError as error:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_to_response(slug, error.current).model_dump(),
        )
    return _to_response(slug, saved)
