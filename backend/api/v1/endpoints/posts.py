from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from api.v1.endpoints.auth import get_current_cms_user
from models.posts import (
    PostListResponse,
    PostResponse,
    PostUpsertRequest,
    PublicPostListResponse,
    PublicPostResponse,
)
from services.posts_service import (
    POSTS_PAGE_SLUG,
    PostsConflictError,
    PostsError,
    PostsNotFoundError,
    PostsPermissionError,
    PostsValidationError,
    can_mutate_post,
    create_post,
    delete_post,
    get_post,
    list_posts,
    update_post,
)
from services.published_status import normalize_published
from services.posts_trash_service import (
    list_trash,
    purge_trash_item,
    restore_trash_item,
)

admin_router = APIRouter()
public_router = APIRouter()


@public_router.get("", response_model=PublicPostListResponse)
async def public_list_posts(
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
):
    result = list_posts(limit=limit, offset=offset, published=True)
    return PublicPostListResponse(
        items=[
            PublicPostResponse(
                id=post["id"],
                createdAt=post["createdAt"],
                media=[
                    (
                        {
                            "type": "image",
                            "imageId": item["imageId"],
                            "width": item["width"],
                            "height": item["height"],
                        }
                        if item["type"] == "image"
                        else {
                            "type": "video",
                            "fileId": item["fileId"],
                            "width": item["width"],
                            "height": item["height"],
                        }
                    )
                    for item in post["media"]
                ],
                copies=post["copies"],
            )
            for post in result["items"]
        ],
        total=result["total"],
        limit=result["limit"],
        offset=result["offset"],
    )


def get_current_posts_editor(user: dict = Depends(get_current_cms_user)) -> dict:
    """site_admin or CMS user assigned to posts. Otherwise 403."""
    if user["role"] == "site_admin":
        return user
    effective = user.get("effectivePages") or []
    if POSTS_PAGE_SLUG not in effective:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Posts access required",
        )
    return user


def require_post_mutator(
    post_id: str,
    user: dict = Depends(get_current_posts_editor),
) -> tuple[dict, dict]:
    """Load post; 404 if missing, 403 if user cannot mutate. Returns (post, user)."""
    try:
        post = get_post(post_id)
    except PostsNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    if not can_mutate_post(user["role"], user["email"], post):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify this post",
        )
    return post, user


def _http_error(error: PostsError) -> HTTPException:
    if isinstance(error, PostsNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )
    if isinstance(error, PostsPermissionError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        )
    if isinstance(error, PostsConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        )
    if isinstance(error, PostsValidationError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(error),
    )


def _to_response(post: dict) -> PostResponse:
    normalize_published(post)
    return PostResponse.model_validate(post)


@admin_router.get("", response_model=PostListResponse)
async def admin_list_posts(
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    query: str | None = Query(default=None, alias="q"),
    created_by: str | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    published: bool | None = Query(default=None),
    pinned: bool | None = Query(default=None),
    _user: dict = Depends(get_current_posts_editor),
):
    if from_date is not None and to_date is not None and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from must be before or equal to to",
        )
    result = list_posts(
        limit=limit,
        offset=offset,
        query=query,
        created_by=created_by,
        from_date=from_date,
        to_date=to_date,
        published=published,
        pinned=pinned,
    )
    return PostListResponse(
        items=[_to_response(item) for item in result["items"]],
        total=result["total"],
        limit=result["limit"],
        offset=result["offset"],
    )


@admin_router.post(
    "",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
)
async def admin_create_post(
    body: PostUpsertRequest,
    user: dict = Depends(get_current_posts_editor),
):
    try:
        created = create_post(
            body.model_dump(),
            created_by=user["email"],
            role=user["role"],
        )
    except PostsError as error:
        raise _http_error(error) from error
    return _to_response(created)


@admin_router.get("/trash", response_model=dict)
async def admin_list_posts_trash(
    _user: dict = Depends(get_current_posts_editor),
):
    try:
        return list_trash(role=_user["role"], email=_user["email"])
    except PostsError as error:
        raise _http_error(error) from error


@admin_router.post("/trash/{trash_id}/restore", response_model=dict)
async def admin_restore_trash_post(
    trash_id: str,
    user: dict = Depends(get_current_posts_editor),
):
    try:
        return restore_trash_item(trash_id, role=user["role"], email=user["email"])
    except PostsError as error:
        raise _http_error(error) from error


@admin_router.delete("/trash/{trash_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_purge_trash_post(
    trash_id: str,
    user: dict = Depends(get_current_posts_editor),
):
    try:
        purge_trash_item(trash_id, role=user["role"], email=user["email"])
    except PostsError as error:
        raise _http_error(error) from error


@admin_router.get("/{post_id}", response_model=PostResponse)
async def admin_get_post(
    post_id: str,
    _user: dict = Depends(get_current_posts_editor),
):
    try:
        return _to_response(get_post(post_id))
    except PostsError as error:
        raise _http_error(error) from error


@admin_router.put("/{post_id}", response_model=PostResponse)
async def admin_update_post(
    post_id: str,
    body: PostUpsertRequest,
    ctx: tuple[dict, dict] = Depends(require_post_mutator),
):
    _post, user = ctx
    if body.contentRevision is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="contentRevision is required",
        )
    try:
        updated = update_post(
            post_id,
            body.model_dump(),
            role=user["role"],
        )
    except PostsConflictError as error:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_to_response(error.post).model_dump(),
        )
    except PostsError as error:
        raise _http_error(error) from error
    return _to_response(updated)


@admin_router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_post(
    post_id: str,
    ctx: tuple[dict, dict] = Depends(require_post_mutator),
):
    _post, user = ctx
    try:
        delete_post(post_id, deleted_by=user["email"])
    except PostsError as error:
        raise _http_error(error) from error
