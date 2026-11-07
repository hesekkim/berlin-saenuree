from fastapi import APIRouter, Depends, HTTPException, status

from api.v1.endpoints.auth import get_current_site_admin
from core.config import settings
from models import SiteSettingsResponse, SiteSettingsUpdateRequest
from services.site_settings_service import (
    SiteSettingsError,
    get_site_settings,
    save_site_settings,
)


router = APIRouter()


def _with_feature_flags(payload: dict) -> SiteSettingsResponse:
    return SiteSettingsResponse(
        **payload,
        pageAdminEnabled=settings.page_admin_enabled,
    )


@router.get("", response_model=SiteSettingsResponse)
async def get_settings():
    return _with_feature_flags(get_site_settings())


@router.put("", response_model=SiteSettingsResponse)
async def put_settings(
    request: SiteSettingsUpdateRequest,
    _email: str = Depends(get_current_site_admin),
):
    try:
        payload = save_site_settings(
            available_languages=request.availableLanguages,
            admin_language=request.adminLanguage,
            default_language=request.defaultLanguage,
        )
    except SiteSettingsError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return _with_feature_flags(payload)
