from fastapi import APIRouter, Depends

from api.v1.endpoints.auth import get_current_site_admin
from api.v1.endpoints.church_members import require_member_manager
from models.cms import (
    BirthdayEmailSettingsResponse,
    BirthdayEmailStatusResponse,
    BirthdayEmailSettingsUpdateRequest,
)
from services.birthday_email_service import (
    get_birthday_email_settings,
    get_birthday_email_status,
    update_birthday_email_settings,
)


router = APIRouter()


@router.get("/status", response_model=BirthdayEmailStatusResponse)
async def get_status(_user: dict = Depends(require_member_manager)):
    return get_birthday_email_status()


@router.get("", response_model=BirthdayEmailSettingsResponse)
async def get_settings(_email: str = Depends(get_current_site_admin)):
    return get_birthday_email_settings()


@router.put("", response_model=BirthdayEmailSettingsResponse)
async def put_settings(
    request: BirthdayEmailSettingsUpdateRequest,
    _email: str = Depends(get_current_site_admin),
):
    return update_birthday_email_settings(
        enabled=request.enabled,
        recipients=request.recipients,
    )
