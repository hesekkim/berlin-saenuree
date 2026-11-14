import math

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from models import (
    CmsMeResponse,
    CmsMeUpdateRequest,
    SendCodeRequest,
    TokenResponse,
    VerifyCodeRequest,
)
from services.auth_service import (
    OtpThrottledError,
    create_access_token,
    send_verification_code,
    verify_code,
    verify_token,
)
from services.cms_users_service import (
    CmsUsersError,
    is_cms_login_allowed,
    normalize_email,
    resolve_cms_user,
    update_cms_user_preferences,
)
router = APIRouter()
security = HTTPBearer(auto_error=False)


def get_current_cms_user(
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = verify_token(credentials.credentials)

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = resolve_cms_user(email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="CMS access revoked",
        )

    response.headers["X-Auth-Token"] = create_access_token(email)
    return user


def get_current_site_admin(user: dict = Depends(get_current_cms_user)) -> str:
    if user["role"] != "site_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Site admin access required",
        )
    return user["email"]


def require_page_editor(slug: str, user: dict = Depends(get_current_cms_user)) -> dict:
    if user["role"] == "site_admin":
        return user
    if slug not in user["effectivePages"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Page access required",
        )
    return user


def _too_many_attempts(error: OtpThrottledError) -> HTTPException:
    minutes = math.ceil(error.retry_after_seconds / 60)
    wait = (
        f"{error.retry_after_seconds} seconds"
        if error.retry_after_seconds < 60
        else f"{minutes} minute{'s' if minutes != 1 else ''}"
    )
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many login attempts. Try again in {wait}.",
        headers={"Retry-After": str(error.retry_after_seconds)},
    )


@router.post("/send-code")
async def send_code(request: SendCodeRequest):
    email = normalize_email(request.email)
    try:
        email_sent = await send_verification_code(
            email, allowed=is_cms_login_allowed(email)
        )
    except OtpThrottledError as error:
        raise _too_many_attempts(error) from error

    if email_sent:
        message = "If this email is authorized, a verification code has been sent"
    else:
        message = (
            "Verification code generated. Email was not sent - "
            "check server logs when debug is enabled."
        )

    return {
        "message": message,
        "email": email,
        "email_sent": email_sent,
    }


@router.post("/verify-code", response_model=TokenResponse)
async def verify_code_endpoint(request: VerifyCodeRequest):
    email = normalize_email(request.email)
    verified = verify_code(email, request.code, allowed=is_cms_login_allowed(email))
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code",
        )

    return TokenResponse(access_token=create_access_token(email))


@router.get("/me", response_model=CmsMeResponse)
async def get_cms_me(user: dict = Depends(get_current_cms_user)):
    return CmsMeResponse(
        email=user["email"],
        is_authenticated=True,
        name=user.get("name"),
        role=user["role"],
        pages=user["pages"],
        effectivePages=user["effectivePages"],
        adminLanguage=user["adminLanguage"],
        darkMode=user.get("darkMode"),
    )


@router.patch("/me", response_model=CmsMeResponse)
async def patch_cms_me(
    request: CmsMeUpdateRequest,
    user: dict = Depends(get_current_cms_user),
):
    try:
        update_cms_user_preferences(
            user["email"],
            admin_language=request.adminLanguage,
            dark_mode=request.darkMode,
        )
    except CmsUsersError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    refreshed = resolve_cms_user(user["email"])
    if refreshed is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="CMS access revoked",
        )

    return CmsMeResponse(
        email=refreshed["email"],
        is_authenticated=True,
        name=refreshed.get("name"),
        role=refreshed["role"],
        pages=refreshed["pages"],
        effectivePages=refreshed["effectivePages"],
        adminLanguage=refreshed["adminLanguage"],
        darkMode=refreshed.get("darkMode"),
    )
