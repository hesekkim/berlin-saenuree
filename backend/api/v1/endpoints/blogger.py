from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from starlette.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from api.v1.endpoints.auth import get_current_cms_user
from models.blogger import (
    BloggerDraftResponse,
    BloggerDraftUpsertRequest,
    BloggerListResponse,
    BloggerResponse,
    BloggerUpsertRequest,
    PublicBloggerListResponse,
    PublicBloggerResponse,
)
from services.blogger_draft_service import (
    delete_draft_for_user,
    delete_draft_for_source,
    get_draft_for_user,
    get_draft_for_source,
    list_drafts_for_user,
    upsert_draft_for_user,
    upsert_draft_for_source,
)
from services.blogger_service import (
    BLOGGER_PAGE_SLUG,
    BloggerConflictError,
    BloggerError,
    BloggerNotFoundError,
    BloggerPermissionError,
    BloggerValidationError,
    can_mutate_blogger,
    create_blogger,
    delete_blogger,
    get_blogger,
    list_blogger,
    update_blogger,
)
from services.published_status import normalize_published
from services.blogger_trash_service import (
    list_trash,
    purge_trash_item,
    restore_trash_item,
)

admin_router = APIRouter()
public_router = APIRouter()


@public_router.get("", response_model=PublicBloggerListResponse)
async def public_list_blogger(
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
):
    result = list_blogger(limit=limit, offset=offset, published=True)
    return PublicBloggerListResponse(
        items=[
            PublicBloggerResponse(
                id=item["id"],
                createdAt=item["createdAt"],
                copies=item["copies"],
            )
            for item in result["items"]
        ],
        total=result["total"],
        limit=result["limit"],
        offset=result["offset"],
    )


@public_router.get("/{blogger_id}", response_model=PublicBloggerResponse)
async def public_get_blogger(blogger_id: str):
    try:
        item = get_blogger(blogger_id)
    except BloggerNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    if not item["published"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blogger not found",
        )
    return PublicBloggerResponse(
        id=item["id"],
        createdAt=item["createdAt"],
        copies=item["copies"],
    )


def get_current_blogger_editor(user: dict = Depends(get_current_cms_user)) -> dict:
    if user["role"] == "site_admin":
        return user
    effective = user.get("effectivePages") or []
    if BLOGGER_PAGE_SLUG not in effective:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Blogger access required",
        )
    return user


def require_blogger_mutator(
    blogger_id: str,
    user: dict = Depends(get_current_blogger_editor),
) -> tuple[dict, dict]:
    try:
        item = get_blogger(blogger_id)
    except BloggerNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    if not can_mutate_blogger(user["role"], user["email"], item):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify this blogger",
        )
    return item, user


def _http_error(error: BloggerError) -> HTTPException:
    if isinstance(error, BloggerNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )
    if isinstance(error, BloggerPermissionError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        )
    if isinstance(error, BloggerConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        )
    if isinstance(error, BloggerValidationError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(error),
    )


def _to_response(item: dict) -> BloggerResponse:
    normalize_published(item)
    return BloggerResponse.model_validate(item)


def _to_draft_response(item: dict) -> BloggerDraftResponse:
    normalize_published(item)
    return BloggerDraftResponse.model_validate(item)


@admin_router.get("", response_model=BloggerListResponse)
async def admin_list_blogger(
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    query: str | None = Query(default=None, alias="q"),
    created_by: str | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    published: bool | None = Query(default=None),
    _user: dict = Depends(get_current_blogger_editor),
):
    if from_date is not None and to_date is not None and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from must be before or equal to to",
        )
    result = list_blogger(
        limit=limit,
        offset=offset,
        query=query,
        created_by=created_by,
        from_date=from_date,
        to_date=to_date,
        published=published,
    )
    return BloggerListResponse(
        items=[_to_response(item) for item in result["items"]],
        total=result["total"],
        limit=result["limit"],
        offset=result["offset"],
    )


@admin_router.post("", response_model=BloggerResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_blogger(
    body: BloggerUpsertRequest,
    user: dict = Depends(get_current_blogger_editor),
):
    try:
        created = await run_in_threadpool(
            create_blogger,
            body.model_dump(),
            created_by=user["email"],
            role=user["role"],
        )
    except BloggerError as error:
        raise _http_error(error) from error
    return _to_response(created)


@admin_router.get("/drafts/me", response_model=BloggerDraftResponse | None)
async def admin_get_my_blogger_draft(
    user: dict = Depends(get_current_blogger_editor),
):
    try:
        draft = get_draft_for_user(user["email"])
    except BloggerError as error:
        raise _http_error(error) from error
    return _to_draft_response(draft) if draft is not None else None


@admin_router.put("/drafts/me", response_model=BloggerDraftResponse)
async def admin_upsert_my_blogger_draft(
    body: BloggerDraftUpsertRequest,
    user: dict = Depends(get_current_blogger_editor),
):
    try:
        draft = upsert_draft_for_user(body.model_dump(), email=user["email"])
    except BloggerConflictError as error:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_to_draft_response(error.item).model_dump(),
        )
    except BloggerError as error:
        raise _http_error(error) from error
    return _to_draft_response(draft)


@admin_router.delete("/drafts/me", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_my_blogger_draft(
    user: dict = Depends(get_current_blogger_editor),
):
    try:
        delete_draft_for_user(user["email"])
    except BloggerNotFoundError:
        return None
    except BloggerError as error:
        raise _http_error(error) from error
    return None


@admin_router.get("/drafts", response_model=list[BloggerDraftResponse])
async def admin_list_my_blogger_drafts(
    user: dict = Depends(get_current_blogger_editor),
):
    try:
        return [_to_draft_response(draft) for draft in list_drafts_for_user(user["email"])]
    except BloggerError as error:
        raise _http_error(error) from error


@admin_router.get("/{blogger_id}/drafts/me", response_model=BloggerDraftResponse | None)
async def admin_get_my_blogger_edit_draft(
    blogger_id: str,
    ctx: tuple[dict, dict] = Depends(require_blogger_mutator),
):
    _item, user = ctx
    try:
        draft = get_draft_for_source(user["email"], source_blogger_id=blogger_id)
    except BloggerError as error:
        raise _http_error(error) from error
    return _to_draft_response(draft) if draft is not None else None


@admin_router.put("/{blogger_id}/drafts/me", response_model=BloggerDraftResponse)
async def admin_upsert_my_blogger_edit_draft(
    blogger_id: str,
    body: BloggerDraftUpsertRequest,
    ctx: tuple[dict, dict] = Depends(require_blogger_mutator),
):
    item, user = ctx
    if (
        body.sourceContentRevision is not None
        and body.sourceContentRevision != item["contentRevision"]
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="sourceContentRevision mismatch",
        )
    try:
        draft = upsert_draft_for_source(
            body.model_dump(),
            email=user["email"],
            source_blogger_id=blogger_id,
            source_content_revision=item["contentRevision"],
            replace_source_content_revision=body.sourceContentRevision is not None,
        )
    except BloggerConflictError as error:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_to_draft_response(error.item).model_dump(),
        )
    except BloggerError as error:
        raise _http_error(error) from error
    return _to_draft_response(draft)


@admin_router.delete("/{blogger_id}/drafts/me", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_my_blogger_edit_draft(
    blogger_id: str,
    ctx: tuple[dict, dict] = Depends(require_blogger_mutator),
):
    _item, user = ctx
    try:
        delete_draft_for_source(user["email"], source_blogger_id=blogger_id)
    except BloggerNotFoundError:
        return None
    except BloggerError as error:
        raise _http_error(error) from error
    return None


@admin_router.get("/trash", response_model=dict)
async def admin_list_blogger_trash(user: dict = Depends(get_current_blogger_editor)):
    return list_trash(role=user["role"], email=user["email"])


@admin_router.post("/trash/{trash_id}/restore", response_model=BloggerResponse)
async def admin_restore_blogger_trash(trash_id: str, user: dict = Depends(get_current_blogger_editor)):
    try:
        return _to_response(restore_trash_item(trash_id, role=user["role"], email=user["email"]))
    except BloggerError as error:
        raise _http_error(error) from error


@admin_router.delete("/trash/{trash_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_purge_blogger_trash(trash_id: str, user: dict = Depends(get_current_blogger_editor)):
    try:
        purge_trash_item(trash_id, role=user["role"], email=user["email"])
    except BloggerError as error:
        raise _http_error(error) from error


@admin_router.get("/{blogger_id}", response_model=BloggerResponse)
async def admin_get_blogger(
    blogger_id: str,
    _user: dict = Depends(get_current_blogger_editor),
):
    try:
        return _to_response(get_blogger(blogger_id))
    except BloggerError as error:
        raise _http_error(error) from error


@admin_router.put("/{blogger_id}", response_model=BloggerResponse)
async def admin_update_blogger(
    blogger_id: str,
    body: BloggerUpsertRequest,
    ctx: tuple[dict, dict] = Depends(require_blogger_mutator),
):
    _item, user = ctx
    if body.contentRevision is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="contentRevision is required",
        )
    try:
        updated = await run_in_threadpool(
            update_blogger,
            blogger_id,
            body.model_dump(),
            role=user["role"],
            created_by=user["email"],
        )
    except BloggerConflictError as error:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_to_response(error.item).model_dump(),
        )
    except BloggerError as error:
        raise _http_error(error) from error
    return _to_response(updated)


@admin_router.delete("/{blogger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_blogger(
    blogger_id: str,
    user: dict = Depends(get_current_blogger_editor),
):
    try:
        delete_blogger(blogger_id, role=user["role"], email=user["email"])
    except BloggerError as error:
        raise _http_error(error) from error
