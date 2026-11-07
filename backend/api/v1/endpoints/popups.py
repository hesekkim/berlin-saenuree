from fastapi import APIRouter, Depends, HTTPException, status

from api.v1.endpoints.auth import get_current_site_admin
from models.popups import (
    PopupReorderRequest,
    PopupResponse,
    PopupUpsertRequest,
    PublishedPopupResponse,
)
from services.popups_service import (
    PopupsError,
    PopupsNotFoundError,
    PopupsValidationError,
    create_popup,
    delete_popup,
    get_popup,
    list_popups,
    list_published_popups,
    reorder_popups,
    to_published_response,
    update_popup,
)

router = APIRouter()
admin_router = APIRouter()


def _http_error(error: PopupsError) -> HTTPException:
    if isinstance(error, PopupsNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )
    if isinstance(error, PopupsValidationError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(error),
    )


def _to_response(popup: dict) -> PopupResponse:
    return PopupResponse.model_validate(popup)


@router.get("", response_model=list[PublishedPopupResponse])
async def get_published_popups():
    return [
        PublishedPopupResponse.model_validate(to_published_response(popup))
        for popup in list_published_popups()
    ]


@admin_router.get("", response_model=list[PopupResponse])
async def admin_list_popups(_email: str = Depends(get_current_site_admin)):
    return [_to_response(popup) for popup in list_popups()]


@admin_router.post("", response_model=PopupResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_popup(
    body: PopupUpsertRequest,
    _email: str = Depends(get_current_site_admin),
):
    try:
        created = create_popup(body.model_dump())
    except PopupsError as error:
        raise _http_error(error) from error
    return _to_response(created)


@admin_router.put("/reorder", response_model=list[PopupResponse])
async def admin_reorder_popups(
    body: PopupReorderRequest,
    _email: str = Depends(get_current_site_admin),
):
    try:
        reordered = reorder_popups(body.orderedIds)
    except PopupsError as error:
        raise _http_error(error) from error
    return [_to_response(popup) for popup in reordered]


@admin_router.get("/{popup_id}", response_model=PopupResponse)
async def admin_get_popup(
    popup_id: str,
    _email: str = Depends(get_current_site_admin),
):
    try:
        return _to_response(get_popup(popup_id))
    except PopupsError as error:
        raise _http_error(error) from error


@admin_router.put("/{popup_id}", response_model=PopupResponse)
async def admin_update_popup(
    popup_id: str,
    body: PopupUpsertRequest,
    _email: str = Depends(get_current_site_admin),
):
    try:
        updated = update_popup(popup_id, body.model_dump())
    except PopupsError as error:
        raise _http_error(error) from error
    return _to_response(updated)


@admin_router.delete("/{popup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_popup(
    popup_id: str,
    _email: str = Depends(get_current_site_admin),
):
    try:
        delete_popup(popup_id)
    except PopupsError as error:
        raise _http_error(error) from error
