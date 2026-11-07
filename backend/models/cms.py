from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from services.cms_users_service import (
    normalize_email,
    require_assignable_pages,
    require_file_role,
    require_name,
    validate_assignable_page_slugs,
)


AdminLanguage = Literal["en", "ko", "de"]
CmsFileRole = Literal["page_admin", "page_manager"]
CmsRole = Literal["site_admin", "page_admin", "page_manager"]


class HomeCopy(BaseModel):
    title: str = ""
    subtitle: str = ""
    description: str = ""


class PageContentResponse(BaseModel):
    slug: str
    contentRevision: int
    content: dict[str, HomeCopy]


class PageContentUpdateRequest(BaseModel):
    contentRevision: int = Field(ge=0)
    content: dict[str, HomeCopy]


class SiteSettingsResponse(BaseModel):
    availableLanguages: list[str] = Field(default_factory=list)
    adminLanguage: AdminLanguage = "en"
    defaultLanguage: str = "ko"
    pageAdminEnabled: bool = False


class SiteSettingsUpdateRequest(BaseModel):
    availableLanguages: list[str] | None = None
    adminLanguage: AdminLanguage | None = None
    defaultLanguage: str | None = None

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        if (
            self.availableLanguages is None
            and self.adminLanguage is None
            and self.defaultLanguage is None
        ):
            raise ValueError("At least one settings field is required")
        return self


class CmsUserResponse(BaseModel):
    email: str
    name: str
    role: CmsFileRole
    pages: list[str]
    darkMode: bool | None = None


class CmsUserCreateRequest(BaseModel):
    email: str
    name: str
    role: CmsFileRole = "page_admin"
    pages: list[str]
    adminLanguage: AdminLanguage = "en"

    @field_validator("email")
    @classmethod
    def normalize_create_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return require_name(value)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return require_file_role(value)

    @field_validator("pages")
    @classmethod
    def require_pages(cls, value: list[str]) -> list[str]:
        return require_assignable_pages(value)


class CmsUserUpdateRequest(BaseModel):
    name: str
    role: CmsFileRole
    pages: list[str]

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return require_name(value)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return require_file_role(value)

    @field_validator("pages")
    @classmethod
    def validate_pages(cls, value: list[str]) -> list[str]:
        # Empty allowed: page_admin merge/revoke may send [].
        # site_admin still requires >=1 in the service layer.
        return validate_assignable_page_slugs(value)


class CmsMeResponse(BaseModel):
    email: str
    is_authenticated: bool = True
    name: str | None = None
    role: CmsRole
    pages: list[str]
    effectivePages: list[str]
    adminLanguage: AdminLanguage
    darkMode: bool | None = None


class CmsMeUpdateRequest(BaseModel):
    adminLanguage: AdminLanguage | None = None
    darkMode: bool | None = None

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        if self.adminLanguage is None and self.darkMode is None:
            raise ValueError("At least one preference field is required")
        return self
