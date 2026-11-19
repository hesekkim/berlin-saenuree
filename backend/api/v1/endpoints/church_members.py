from fastapi import APIRouter, Depends, HTTPException, Response, status

from api.v1.endpoints.auth import get_current_cms_user
from models import (
    ChurchMemberCreateRequest,
    ChurchMemberResponse,
    ChurchMemberUpdateRequest,
)
from services.church_members_service import (
    ChurchMemberNotFoundError,
    create_church_member,
    delete_church_member,
    list_church_members,
    update_church_member,
)


router = APIRouter()
MEMBERS_PAGE_SLUG = "members"


def _has_member_page_access(user: dict) -> bool:
    return user["role"] == "site_admin" or MEMBERS_PAGE_SLUG in user.get(
        "effectivePages", []
    )


def require_member_viewer(user: dict = Depends(get_current_cms_user)) -> dict:
    if user["role"] not in {"site_admin", "page_admin", "page_manager"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Church member directory access required",
        )
    if not _has_member_page_access(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Church member directory access required",
        )
    return user


def require_member_manager(user: dict = Depends(get_current_cms_user)) -> dict:
    if user["role"] not in {"site_admin", "page_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Church member management required",
        )
    if not _has_member_page_access(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Church member directory access required",
        )
    return user


@router.get("", response_model=list[ChurchMemberResponse])
async def get_church_members(
    _user: dict = Depends(require_member_viewer),
):
    return list_church_members()


@router.post(
    "",
    response_model=ChurchMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_church_member(
    request: ChurchMemberCreateRequest,
    _user: dict = Depends(require_member_manager),
):
    return create_church_member(request)


@router.put("/{member_id}", response_model=ChurchMemberResponse)
async def put_church_member(
    member_id: str,
    request: ChurchMemberUpdateRequest,
    _user: dict = Depends(require_member_manager),
):
    try:
        return update_church_member(member_id, request)
    except ChurchMemberNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Church member not found",
        ) from error


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_church_member(
    member_id: str,
    _user: dict = Depends(require_member_manager),
):
    try:
        delete_church_member(member_id)
    except ChurchMemberNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Church member not found",
        ) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
