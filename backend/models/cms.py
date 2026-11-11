from typing import Any, Literal
import re
from urllib.parse import parse_qs, urlparse

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


class HomeImage(BaseModel):
    imageId: str
    sourceFileId: str


class HomeCopy(BaseModel):
    model_config = {"extra": "allow"}

    yearMotto: str = ""
    bibleVerse: str = ""
    bibleReference: str = ""

    @model_validator(mode="after")
    def validate_legacy_video_urls(self):
        if "youtubeVideoUrls" in (self.model_extra or {}):
            HomeSharedMedia(
                youtubeVideoUrls=self.model_extra["youtubeVideoUrls"]
            )
        return self


class HomeSharedMedia(BaseModel):
    model_config = {"extra": "forbid"}

    heroImages: list[HomeImage] = Field(default_factory=list)
    panoramaImageId: str = ""
    panoramaSourceFileId: str = ""
    youtubeVideoUrls: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("youtubeVideoUrls")
    @classmethod
    def validate_youtube_video_urls(cls, values: list[str]) -> list[str]:
        video_id_pattern = re.compile(r"^[A-Za-z0-9_-]{11}$")
        hosts = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
        normalized: list[str] = []
        for value in values:
            video = value.strip()
            if video_id_pattern.fullmatch(video):
                normalized.append(video)
                continue
            parsed = urlparse(video)
            path = [segment for segment in parsed.path.split("/") if segment]
            if parsed.scheme != "https" or parsed.hostname not in hosts:
                raise ValueError("YouTube videos must use a supported HTTPS URL or video ID")
            if parsed.hostname == "youtu.be":
                video_id = path[0] if path else ""
            elif parsed.path == "/watch":
                video_id = parse_qs(parsed.query).get("v", [""])[0]
            elif path and path[0] in {"embed", "shorts", "live"}:
                video_id = path[1] if len(path) > 1 else ""
            else:
                video_id = ""
            if not video_id_pattern.fullmatch(video_id or ""):
                raise ValueError("Invalid YouTube video URL")
            normalized.append(video)
        if len(normalized) > 3:
            raise ValueError("Select no more than three YouTube videos")
        return normalized


class ChurchHistoryEventMedia(BaseModel):
    model_config = {"extra": "forbid"}

    imageId: str = ""
    sourceFileId: str = ""


class ChurchHistorySharedMedia(BaseModel):
    model_config = {"extra": "forbid"}

    events: dict[str, ChurchHistoryEventMedia] = Field(default_factory=dict)


class VisitImageMedia(BaseModel):
    model_config = {"extra": "forbid"}

    imageId: str
    sourceFileId: str

    @model_validator(mode="after")
    def require_media_reference(self):
        if not self.imageId or not self.sourceFileId:
            raise ValueError("Each Visit image requires imageId and sourceFileId")
        return self


class VisitSharedMedia(BaseModel):
    model_config = {"extra": "forbid"}

    mapImages: list[VisitImageMedia] = Field(default_factory=list)
    venueImages: list[VisitImageMedia] = Field(default_factory=list)


class PageContentResponse(BaseModel):
    slug: str
    contentRevision: int
    content: dict[str, HomeCopy]
    sharedMedia: HomeSharedMedia | ChurchHistorySharedMedia | VisitSharedMedia | None = None


class PageContentUpdateRequest(BaseModel):
    contentRevision: int = Field(ge=0)
    content: dict[str, HomeCopy]
    sharedMedia: HomeSharedMedia | ChurchHistorySharedMedia | VisitSharedMedia | None = None

    @model_validator(mode="after")
    def validate_legacy_home_media(self):
        if self.sharedMedia is None:
            for copy in self.content.values():
                legacy_url = (copy.model_extra or {}).get("youtubeVideoUrl")
                if legacy_url:
                    HomeSharedMedia(youtubeVideoUrls=[legacy_url])
        return self


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
