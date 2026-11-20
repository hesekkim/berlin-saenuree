from pathlib import Path
import re
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


WEAK_JWT_SECRETS = {
    "",
    "your-secret-key-change-in-production",
    "your-super-secret-jwt-key-change-this-in-production",
}

MIN_JWT_SECRET_LENGTH = 32

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_NON_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    return _NON_SLUG_RE.sub("-", value.lower()).strip("-")


def _parse_admin_emails(value: object) -> list[str]:
    if value is None:
        raise ValueError(
            "APP_ADMIN_EMAILS is required (comma-separated, at least one email)"
        )
    if isinstance(value, str):
        parts = value.split(",")
    elif isinstance(value, (list, tuple)):
        parts = value
    else:
        raise ValueError("APP_ADMIN_EMAILS must be a comma-separated string or list")

    emails: list[str] = []
    for part in parts:
        email = str(part).strip().lower()
        if not email:
            continue
        if not _EMAIL_RE.match(email):
            raise ValueError(f"Invalid admin email in APP_ADMIN_EMAILS: {part!r}")
        if email not in emails:
            emails.append(email)

    if not emails:
        raise ValueError(
            "APP_ADMIN_EMAILS must contain at least one valid email"
        )
    return emails


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        env_file_encoding="utf-8",
        env_prefix="APP_",
    )

    app_name: str = "Berlin Saenuree Server"
    # Identifies this site in JWT `iss`; defaults to a slug of app_name.
    site_id: str = ""
    debug: bool = False
    port: int = 9000
    host: str = "0.0.0.0"
    api_version: str = "v1"

    allowed_origins: list[str] = ["http://localhost:9090"]

    admin_emails: Annotated[list[str], NoDecode]
    # When false, only APP_ADMIN_EMAILS site admins; cms_users login/API/UI off
    page_admin_enabled: bool = False

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 30

    relay_publisher_credential: str = ""
    relay_listener_token_secret: str = ""
    relay_listener_token_minutes: int = Field(default=90, gt=0, le=90)
    relay_allowed_origins: Annotated[list[str], NoDecode] = []
    relay_allowed_origin_suffixes: Annotated[list[str], NoDecode] = []

    @field_validator("relay_allowed_origins", "relay_allowed_origin_suffixes", mode="before")
    @classmethod
    def parse_relay_origin_lists(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            import json
            try:
                parsed = json.loads(v)
            except json.JSONDecodeError:
                parsed = [part.strip() for part in v.split(",")]
            return parsed if isinstance(parsed, list) else []
        return v

    smtp_host: str = ""
    smtp_port: int = 0
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Berlin Saenuree"
    send_real_email: bool = False

    # Trusted reverse proxies in front of the app. Unset means 1 (Render-style deploy).
    # Set 0 when the app is reached directly; forwarding headers are then ignored.
    trusted_proxy_hops: int | None = None
    # Deprecated: used only when APP_TRUSTED_PROXY_HOPS is unset.
    trust_proxy_headers: bool | None = None
    data_root: str = ""
    # Scheduled trash expiry and orphan media sweep run inside the app process.
    maintenance_enabled: bool = True
    # When true, the orphan sweep only logs candidates; set false after reviewing the logs.
    media_gc_dry_run: bool = True
    # Default max upload size for media files (bytes). Request may set a lower cap.
    media_max_file_bytes: int = 200 * 1024 * 1024
    # Max request body for every endpoint except the media file upload (bytes).
    max_request_body_bytes: int = 5 * 1024 * 1024
    backup_password: str = ""
    backup_root: str = ""
    backup_max_archive_bytes: int = Field(default=512 * 1024 * 1024, gt=0)
    backup_max_expanded_bytes: int = Field(default=2 * 1024 * 1024 * 1024, gt=0)

    @field_validator("admin_emails", mode="before")
    @classmethod
    def parse_admin_emails(cls, v):
        return _parse_admin_emails(v)

    @field_validator("data_root", mode="before")
    @classmethod
    def set_data_root(cls, v):
        if v:
            return v
        return str(Path(__file__).parent.parent)

    @property
    def effective_trusted_proxy_hops(self) -> int:
        if self.trusted_proxy_hops is not None:
            return max(0, self.trusted_proxy_hops)
        if self.trust_proxy_headers is not None:
            return 1 if self.trust_proxy_headers else 0
        return 1

    @property
    def base_path(self) -> Path:
        return Path(self.data_root)

    @property
    def data_dir(self) -> Path:
        return self.base_path / "data"

    @property
    def media_upload_temp_dir(self) -> Path:
        path = self.base_path / ".media-upload-tmp"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def backup_dir(self) -> Path:
        return Path(self.backup_root) if self.backup_root else self.base_path / "backups"

    @property
    def verification_codes_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "verification_codes.json"

    @property
    def site_settings_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "site_settings.json"

    @property
    def cms_users_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "cms_users.json"

    @property
    def church_members_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "church_members.json"

    @property
    def birthday_email_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "birthday_email.json"

    @property
    def pages_dir(self) -> Path:
        path = self.data_dir / "pages"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def page_content_file(self, slug: str) -> Path:
        return self.pages_dir / f"{slug}.json"

    @property
    def media_files_dir(self) -> Path:
        path = self.data_dir / "media" / "files"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def media_file_dir(self, file_id: str) -> Path:
        return self.media_files_dir / file_id

    @property
    def media_images_dir(self) -> Path:
        path = self.data_dir / "media" / "images"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def media_image_dir(self, image_id: str) -> Path:
        return self.media_images_dir / image_id

    @property
    def popups_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "popups.json"

    @property
    def posts_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "posts.json"

    @property
    def posts_trash_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "posts_trash.json"

    @property
    def blogger_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "blogger.json"

    @property
    def blogger_trash_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "blogger_trash.json"

    @property
    def blogger_drafts_file(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir / "blogger_drafts.json"

    posts_trash_retention_days: int = 30
    blogger_trash_retention_days: int = 30

    @property
    def has_weak_jwt_secret(self) -> bool:
        return (
            self.jwt_secret_key in WEAK_JWT_SECRETS
            or len(self.jwt_secret_key) < MIN_JWT_SECRET_LENGTH
        )

    @property
    def jwt_issuer(self) -> str:
        return self.site_id.strip() or _slugify(self.app_name) or "site"

    def is_site_admin_email(self, email: str) -> bool:
        return str(email).strip().lower() in self.admin_emails


settings = Settings()
