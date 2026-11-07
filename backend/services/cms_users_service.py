import logging
import re

from core.config import settings
from core.json_store import (
    JsonStoreCorruptError,
    read_json_store,
    read_keyed_list,
    write_json_store,
)
from services.page_catalog import all_slugs, assignable_slugs, expand_page_access
from services.site_settings_service import (
    DEFAULT_ADMIN_LANGUAGE,
    normalize_admin_language,
)


logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
FILE_ROLES = frozenset({"page_admin", "page_manager"})
SITE_ADMIN_PREFERENCES_KEY = "siteAdminPreferences"
LEGACY_SITE_ADMIN_NAME = "Site Admin"


class CmsUsersError(ValueError):
    """Invalid CMS user payload or conflict."""


class CmsUsersForbiddenError(CmsUsersError):
    """Actor is not allowed to perform this CMS users action."""


class CmsUsersNotFoundError(CmsUsersError):
    """Target CMS user does not exist."""


class CmsUsersConflictError(CmsUsersError):
    """CMS user already exists for this email."""


def normalize_email(value: object) -> str:
    return str(value).strip().lower()


def is_valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email))


def normalize_name(value: object) -> str:
    return str(value).strip()


def normalize_dark_mode(value: object) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "on"}:
        return True
    if normalized in {"false", "0", "no", "off"}:
        return False
    return None


def require_name(value: object) -> str:
    name = normalize_name(value)
    if not name:
        raise CmsUsersError("Name is required")
    return name


def require_file_role(value: object) -> str:
    role = str(value).strip()
    if role not in FILE_ROLES:
        raise CmsUsersError("Invalid role")
    return role


def normalize_pages(pages: list[str]) -> list[str]:
    """Keep only assignable (main) slugs. Used when loading stored users."""
    allowed = set(assignable_slugs())
    unique: list[str] = []
    for raw in pages:
        slug = str(raw).strip()
        if slug not in allowed or slug in unique:
            continue
        unique.append(slug)
    return unique


def validate_assignable_page_slugs(pages: list[str]) -> list[str]:
    """Validate main-page slugs. Empty list is allowed (caller enforces min)."""
    allowed = set(assignable_slugs())
    known = all_slugs()
    subpages: list[str] = []
    unknown: list[str] = []

    for raw in pages:
        slug = str(raw).strip()
        if not slug or slug in allowed:
            continue
        if slug in known:
            if slug not in subpages:
                subpages.append(slug)
        elif slug not in unknown:
            unknown.append(slug)

    if subpages:
        raise CmsUsersError(
            "Only main pages can be assigned "
            f"(not subpages): {', '.join(subpages)}"
        )
    if unknown:
        raise CmsUsersError(f"Unknown page slug(s): {', '.join(unknown)}")

    return normalize_pages(pages)


def require_assignable_pages(pages: list[str]) -> list[str]:
    """Validate CMS user page assignments: main pages only, at least one.

    Strips whitespace. Distinguishes known subpages from unknown slugs.
    """
    normalized = validate_assignable_page_slugs(pages)
    if not normalized:
        raise CmsUsersError("At least one page is required")
    return normalized


def _require_account_manager(actor: dict) -> None:
    if actor.get("role") not in {"site_admin", "page_admin"}:
        raise CmsUsersForbiddenError("CMS account management required")


def _actor_pages(actor: dict) -> set[str]:
    pages = actor.get("pages") or []
    return set(normalize_pages([str(item) for item in pages]))


def _pages_within_actor_scope(pages: list[str], actor_pages: set[str]) -> None:
    outside = [slug for slug in pages if slug not in actor_pages]
    if outside:
        raise CmsUsersError(
            "Pages outside your assignment: " + ", ".join(outside)
        )


def assignable_pages_for_actor(actor: dict) -> list[str]:
    _require_account_manager(actor)
    if actor["role"] == "site_admin":
        return list(assignable_slugs())
    return [slug for slug in assignable_slugs() if slug in _actor_pages(actor)]


def list_cms_users_for_actor(actor: dict) -> list[dict]:
    _require_account_manager(actor)
    users = list_cms_users()
    if actor["role"] == "site_admin":
        return users

    actor_email = normalize_email(actor["email"])
    actor_pages = _actor_pages(actor)
    visible: list[dict] = []
    for user in users:
        if user["email"] == actor_email:
            continue
        if actor_pages.intersection(user["pages"]):
            visible.append(user)
    return visible


def _replace_user(normalized_email: str, updated: dict | None) -> None:
    store = _load_store()
    next_users: list[dict] = []
    for raw in store["users"]:
        user = _normalize_user(raw)
        if user is None:
            continue
        if user["email"] == normalized_email:
            if updated is not None:
                next_users.append(updated)
            continue
        next_users.append(user)
    store["users"] = next_users
    _save_store(store)


def _normalize_site_admin_preferences(raw: object) -> dict:
    """Keep only explicitly stored fields so unset ones fall back to site settings."""
    if not isinstance(raw, dict):
        return {}
    preferences: dict = {}
    if "adminLanguage" in raw:
        preferences["adminLanguage"] = normalize_admin_language(raw["adminLanguage"])
    dark_mode = normalize_dark_mode(raw.get("darkMode"))
    if dark_mode is not None:
        preferences["darkMode"] = dark_mode
    return preferences


def _is_legacy_site_admin_record(raw: object) -> bool:
    return (
        isinstance(raw, dict)
        and str(raw.get("name", "")).strip() == LEGACY_SITE_ADMIN_NAME
        and settings.is_site_admin_email(normalize_email(raw.get("email", "")))
    )


def _move_legacy_site_admin_records(store: dict) -> None:
    remaining = []
    for raw in store["users"]:
        if _is_legacy_site_admin_record(raw):
            store[SITE_ADMIN_PREFERENCES_KEY].setdefault(
                normalize_email(raw["email"]), _normalize_site_admin_preferences(raw)
            )
            continue
        remaining.append(raw)
    store["users"] = remaining


def _load_store() -> dict:
    """Raises JsonStoreCorruptError instead of returning an empty store."""
    path = settings.cms_users_file
    payload = read_json_store(path)
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        raise JsonStoreCorruptError(path, "expected a JSON object")
    users = payload.get("users", [])
    preferences = payload.get(SITE_ADMIN_PREFERENCES_KEY, {})
    if not isinstance(users, list):
        raise JsonStoreCorruptError(path, "'users' must be a list")
    if not isinstance(preferences, dict):
        raise JsonStoreCorruptError(
            path, f"'{SITE_ADMIN_PREFERENCES_KEY}' must be an object"
        )
    store = {
        "users": users,
        SITE_ADMIN_PREFERENCES_KEY: {
            normalize_email(email): value for email, value in preferences.items()
        },
    }
    _move_legacy_site_admin_records(store)
    return store


def _save_store(store: dict) -> None:
    payload = {"users": store["users"]}
    if store[SITE_ADMIN_PREFERENCES_KEY]:
        payload[SITE_ADMIN_PREFERENCES_KEY] = store[SITE_ADMIN_PREFERENCES_KEY]
    write_json_store(settings.cms_users_file, payload)


def migrate_site_admin_preferences() -> None:
    """Persist the legacy-record migration and flag records it cannot classify."""
    try:
        stored_user_count = len(read_keyed_list(settings.cms_users_file, "users"))
        store = _load_store()
    except JsonStoreCorruptError as error:
        logger.error("CMS users store unreadable at startup: %s", error)
        return

    moved = stored_user_count - len(store["users"])
    if moved > 0:
        _save_store(store)
        logger.info("Moved %s legacy site admin record(s) to preferences", moved)

    for raw in store["users"]:
        if (
            isinstance(raw, dict)
            and str(raw.get("name", "")).strip() == LEGACY_SITE_ADMIN_NAME
        ):
            logger.warning(
                "CMS user %s has the legacy '%s' name but is not a site admin; "
                "review cms_users.json",
                normalize_email(raw.get("email", "")),
                LEGACY_SITE_ADMIN_NAME,
            )


def _get_cms_user_for_auth(email: str) -> dict | None:
    """Auth paths must not crash on a corrupt store; no record means no access."""
    try:
        return get_cms_user(email)
    except JsonStoreCorruptError as error:
        logger.error("CMS users store unreadable during auth: %s", error)
        return None

def _normalize_user(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    email = normalize_email(raw.get("email", ""))
    if not email or not is_valid_email(email):
        return None
    try:
        name = require_name(raw.get("name", ""))
        role = require_file_role(raw.get("role", ""))
    except CmsUsersError:
        return None
    pages = raw.get("pages", [])
    if not isinstance(pages, list):
        return None
    normalized_pages = normalize_pages([str(item) for item in pages])
    if not normalized_pages:
        return None
    return {
        "email": email,
        "name": name,
        "role": role,
        "pages": normalized_pages,
        "adminLanguage": normalize_admin_language(
            raw.get("adminLanguage", DEFAULT_ADMIN_LANGUAGE)
        ),
        "darkMode": normalize_dark_mode(raw.get("darkMode")),
    }


def list_cms_users() -> list[dict]:
    store = _load_store()
    users: list[dict] = []
    for raw in store["users"]:
        user = _normalize_user(raw)
        if user is None:
            continue
        if settings.is_site_admin_email(user["email"]):
            continue
        users.append(user)
    users.sort(key=lambda item: item["email"])
    return users


def get_cms_user(email: str) -> dict | None:
    target = normalize_email(email)
    for user in list_cms_users():
        if user["email"] == target:
            return user
    return None


def create_cms_user(
    email: str,
    pages: list[str],
    name: str,
    role: str = "page_admin",
    admin_language: str | None = None,
    dark_mode: bool | None = None,
) -> dict:
    normalized_email = normalize_email(email)
    if not is_valid_email(normalized_email):
        raise CmsUsersError("Invalid email")
    if settings.is_site_admin_email(normalized_email):
        raise CmsUsersError("Cannot create a CMS user for a site admin email")
    if get_cms_user(normalized_email) is not None:
        raise CmsUsersConflictError("CMS user already exists")

    normalized_name = require_name(name)
    normalized_role = require_file_role(role)
    normalized_pages = require_assignable_pages(pages)

    user = {
        "email": normalized_email,
        "name": normalized_name,
        "role": normalized_role,
        "pages": normalized_pages,
        "adminLanguage": normalize_admin_language(
            admin_language if admin_language is not None else DEFAULT_ADMIN_LANGUAGE
        ),
        "darkMode": normalize_dark_mode(dark_mode),
    }

    store = _load_store()
    store["users"] = [raw for raw in store["users"] if isinstance(raw, dict)]
    store["users"].append(user)
    _save_store(store)
    return user


def create_cms_user_as_actor(
    actor: dict,
    *,
    email: str,
    pages: list[str],
    name: str,
    role: str = "page_admin",
    admin_language: str | None = None,
) -> dict:
    _require_account_manager(actor)

    if actor["role"] == "site_admin":
        return create_cms_user(
            email=email,
            pages=pages,
            name=name,
            role=role,
            admin_language=admin_language,
        )

    if require_file_role(role) != "page_manager":
        raise CmsUsersForbiddenError("Page admins may only create page managers")

    normalized_pages = require_assignable_pages(pages)
    _pages_within_actor_scope(normalized_pages, _actor_pages(actor))
    return create_cms_user(
        email=email,
        pages=normalized_pages,
        name=name,
        role="page_manager",
        admin_language=admin_language,
    )


def update_cms_user(
    email: str,
    *,
    name: str,
    role: str,
    pages: list[str],
) -> dict:
    """Update name, role, and pages. Email is immutable (path only)."""
    normalized_email = normalize_email(email)
    existing = get_cms_user(normalized_email)
    if existing is None:
        raise CmsUsersNotFoundError("CMS user not found")

    updated = {
        **existing,
        "name": require_name(name),
        "role": require_file_role(role),
        "pages": require_assignable_pages(pages),
    }
    _replace_user(normalized_email, updated)
    return updated


def _merge_pages_within_actor_scope(
    existing_pages: list[str],
    incoming_pages: list[str],
    actor_pages: set[str],
) -> list[str]:
    incoming = validate_assignable_page_slugs(incoming_pages)
    _pages_within_actor_scope(incoming, actor_pages)
    incoming_set = set(incoming)
    merged: list[str] = []
    for slug in existing_pages:
        if slug not in actor_pages or slug in incoming_set:
            if slug not in merged:
                merged.append(slug)
    for slug in incoming:
        if slug not in merged:
            merged.append(slug)
    return normalize_pages(merged)


def update_cms_user_as_actor(
    actor: dict,
    email: str,
    *,
    name: str,
    role: str,
    pages: list[str],
) -> dict | None:
    """Update a CMS user as actor. Returns None when the account was deleted."""
    _require_account_manager(actor)
    normalized_email = normalize_email(email)
    existing = get_cms_user(normalized_email)
    if existing is None:
        raise CmsUsersNotFoundError("CMS user not found")

    if actor["role"] == "site_admin":
        return update_cms_user(
            normalized_email,
            name=name,
            role=role,
            pages=pages,
        )

    actor_email = normalize_email(actor["email"])
    if existing["email"] == actor_email:
        raise CmsUsersForbiddenError("Cannot update your own CMS account")
    if existing["role"] != "page_manager":
        raise CmsUsersForbiddenError("Page admins may only update page managers")
    if not _actor_pages(actor).intersection(existing["pages"]):
        raise CmsUsersForbiddenError("No overlapping page assignment")
    if require_file_role(role) != "page_manager":
        raise CmsUsersForbiddenError("Only site admins can assign page_admin role")

    actor_pages = _actor_pages(actor)
    merged_pages = _merge_pages_within_actor_scope(
        existing["pages"],
        pages,
        actor_pages,
    )
    if not merged_pages:
        _replace_user(normalized_email, None)
        return None

    updated = {
        **existing,
        "name": require_name(name),
        "role": "page_manager",
        "pages": merged_pages,
    }
    _replace_user(normalized_email, updated)
    return updated


def update_cms_user_pages(email: str, pages: list[str]) -> dict:
    """Update pages only; keep existing name and role."""
    existing = get_cms_user(email)
    if existing is None:
        raise CmsUsersNotFoundError("CMS user not found")
    return update_cms_user(
        email,
        name=existing["name"],
        role=existing["role"],
        pages=pages,
    )


def update_cms_user_language(email: str, admin_language: str) -> dict:
    normalized_email = normalize_email(email)
    existing = get_cms_user(normalized_email)
    if existing is None:
        raise CmsUsersNotFoundError("CMS user not found")

    updated = {
        **existing,
        "adminLanguage": normalize_admin_language(admin_language),
    }
    _replace_user(normalized_email, updated)
    return updated


def update_cms_user_preferences(
    email: str,
    *,
    admin_language: str | None = None,
    dark_mode: bool | None = None,
) -> dict:
    normalized_email = normalize_email(email)
    existing = get_cms_user(normalized_email)
    if existing is None and not settings.is_site_admin_email(normalized_email):
        raise CmsUsersNotFoundError("CMS user not found")

    if settings.is_site_admin_email(normalized_email):
        store = _load_store()
        preferences = _normalize_site_admin_preferences(
            store[SITE_ADMIN_PREFERENCES_KEY].get(normalized_email)
        )
        if admin_language is not None:
            preferences["adminLanguage"] = normalize_admin_language(admin_language)
        if dark_mode is not None:
            preferences["darkMode"] = normalize_dark_mode(dark_mode)
        store[SITE_ADMIN_PREFERENCES_KEY][normalized_email] = preferences
        _save_store(store)
        return {"email": normalized_email, **preferences}

    updated = {**existing}
    if admin_language is not None:
        updated["adminLanguage"] = normalize_admin_language(admin_language)
    if dark_mode is not None:
        updated["darkMode"] = normalize_dark_mode(dark_mode)

    _replace_user(normalized_email, updated)
    return updated


def delete_cms_user(email: str) -> None:
    normalized_email = normalize_email(email)
    if get_cms_user(normalized_email) is None:
        raise CmsUsersNotFoundError("CMS user not found")
    _replace_user(normalized_email, None)


def delete_cms_user_as_actor(actor: dict, email: str) -> None:
    """Delete account (site_admin) or revoke actor pages (page_admin)."""
    _require_account_manager(actor)
    normalized_email = normalize_email(email)
    existing = get_cms_user(normalized_email)
    if existing is None:
        raise CmsUsersNotFoundError("CMS user not found")

    if actor["role"] == "site_admin":
        delete_cms_user(normalized_email)
        return

    actor_email = normalize_email(actor["email"])
    if existing["email"] == actor_email:
        raise CmsUsersForbiddenError("Cannot delete your own CMS account")
    if existing["role"] != "page_manager":
        raise CmsUsersForbiddenError("Page admins may only revoke page managers")
    actor_pages = _actor_pages(actor)
    if not actor_pages.intersection(existing["pages"]):
        raise CmsUsersForbiddenError("No overlapping page assignment")

    remaining = [slug for slug in existing["pages"] if slug not in actor_pages]
    if not remaining:
        _replace_user(normalized_email, None)
        return

    updated = {**existing, "pages": normalize_pages(remaining)}
    _replace_user(normalized_email, updated)


def is_cms_login_allowed(email: str) -> bool:
    normalized = normalize_email(email)
    if not normalized:
        return False
    if settings.is_site_admin_email(normalized):
        return True
    if not settings.page_admin_enabled:
        return False
    return _get_cms_user_for_auth(normalized) is not None


def _site_admin_preferences(email: str) -> dict:
    normalized = normalize_email(email)
    if not settings.is_site_admin_email(normalized):
        return {}

    try:
        store = _load_store()
    except JsonStoreCorruptError as error:
        logger.error("CMS users store unreadable during auth: %s", error)
        return {}
    return _normalize_site_admin_preferences(
        store[SITE_ADMIN_PREFERENCES_KEY].get(normalized)
    )


def resolve_cms_user(email: str) -> dict | None:
    """Return current CMS identity with effective page access. Re-reads store each call."""
    normalized = normalize_email(email)
    if not normalized:
        return None

    if settings.is_site_admin_email(normalized):
        from services.site_settings_service import get_site_settings

        preferences = _site_admin_preferences(normalized)
        return {
            "email": normalized,
            "name": None,
            "role": "site_admin",
            "pages": list(assignable_slugs()),
            "effectivePages": list(expand_page_access(assignable_slugs())),
            "adminLanguage": preferences.get(
                "adminLanguage", get_site_settings()["adminLanguage"]
            ),
            "darkMode": preferences.get("darkMode"),
        }

    if not settings.page_admin_enabled:
        return None

    cms_user = _get_cms_user_for_auth(normalized)
    if cms_user is None:
        return None

    return {
        "email": cms_user["email"],
        "name": cms_user["name"],
        "role": cms_user["role"],
        "pages": list(cms_user["pages"]),
        "effectivePages": list(expand_page_access(cms_user["pages"])),
        "adminLanguage": cms_user["adminLanguage"],
        "darkMode": cms_user.get("darkMode"),
    }
