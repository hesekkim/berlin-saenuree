from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Response, status

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from models import CmsUserCreateRequest, CmsUserResponse, CmsUserUpdateRequest
from services.cms_users_service import (
    CmsUsersConflictError,
    CmsUsersError,
    CmsUsersForbiddenError,
    CmsUsersNotFoundError,
    assignable_pages_for_actor,
    create_cms_user_as_actor,
    delete_cms_user_as_actor,
    list_cms_users_for_actor,
    update_cms_user_as_actor,
)


router = APIRouter()


def require_cms_account_manager(
    user: dict = Depends(get_current_cms_user),
) -> dict:
    if not settings.page_admin_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CMS accounts feature is disabled",
        )
    if user["role"] not in {"site_admin", "page_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CMS account management required",
        )
    return user


def _user_response(user: dict) -> CmsUserResponse:
    return CmsUserResponse(
        email=user["email"],
        name=user["name"],
        role=user["role"],
        pages=user["pages"],
    )


def _http_error_from_cms(error: CmsUsersError) -> HTTPException:
    if isinstance(error, CmsUsersForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        )
    if isinstance(error, CmsUsersNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )
    if isinstance(error, CmsUsersConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=str(error),
    )


@router.get("/assignable-pages")
async def get_assignable_pages(actor: dict = Depends(require_cms_account_manager)):
    try:
        return {"pages": assignable_pages_for_actor(actor)}
    except CmsUsersError as error:
        raise _http_error_from_cms(error) from error


@router.get("", response_model=list[CmsUserResponse])
async def get_cms_users(actor: dict = Depends(require_cms_account_manager)):
    try:
        return [_user_response(user) for user in list_cms_users_for_actor(actor)]
    except CmsUsersError as error:
        raise _http_error_from_cms(error) from error


@router.post("", response_model=CmsUserResponse, status_code=status.HTTP_201_CREATED)
async def post_cms_user(
    request: CmsUserCreateRequest,
    actor: dict = Depends(require_cms_account_manager),
):
    try:
        user = create_cms_user_as_actor(
            actor,
            email=request.email,
            pages=request.pages,
            name=request.name,
            role=request.role,
            admin_language=request.adminLanguage,
        )
    except CmsUsersError as error:
        raise _http_error_from_cms(error) from error

    return _user_response(user)


@router.put("/{email}", response_model=CmsUserResponse | None)
async def put_cms_user(
    email: str,
    request: CmsUserUpdateRequest,
    actor: dict = Depends(require_cms_account_manager),
):
    try:
        user = update_cms_user_as_actor(
            actor,
            unquote(email),
            name=request.name,
            role=request.role,
            pages=request.pages,
        )
    except CmsUsersError as error:
        raise _http_error_from_cms(error) from error

    if user is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return _user_response(user)


@router.delete("/{email}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cms_user(
    email: str,
    actor: dict = Depends(require_cms_account_manager),
):
    try:
        delete_cms_user_as_actor(actor, unquote(email))
    except CmsUsersError as error:
        raise _http_error_from_cms(error) from error
