from core.config import settings
from core.json_store import read_json_store, write_json_store
from services.blogger_draft_service import remove_language_from_all_blogger_drafts
from services.blogger_service import remove_language_from_all_bloggers
from services.blogger_trash_service import remove_language_from_all_blogger_trash
from services.page_content_service import remove_language_from_all_pages
from services.popups_service import remove_language_from_all_popups
from services.posts_service import remove_language_from_all_posts
from services.site_settings_store import (
    DEFAULT_ADMIN_LANGUAGE,
    DEFAULT_AVAILABLE_LANGUAGES,
    load_site_settings_file,
    normalize_admin_language,
    normalize_available_languages,
    resolve_default_language,
)


class SiteSettingsError(ValueError):
    """Invalid site settings payload."""


def get_default_site_settings() -> dict:
    return {
        "availableLanguages": list(DEFAULT_AVAILABLE_LANGUAGES),
        "adminLanguage": DEFAULT_ADMIN_LANGUAGE,
        "defaultLanguage": resolve_default_language(DEFAULT_AVAILABLE_LANGUAGES, None),
    }


def _save_site_settings_file(payload: dict) -> None:
    path = settings.site_settings_file
    read_json_store(path)
    write_json_store(path, payload)


def get_site_settings() -> dict:
    stored = load_site_settings_file()
    if stored is None:
        return get_default_site_settings()
    return stored


def save_site_settings(
    available_languages: list[str] | None = None,
    admin_language: str | None = None,
    default_language: str | None = None,
) -> dict:
    if (
        available_languages is None
        and admin_language is None
        and default_language is None
    ):
        raise SiteSettingsError("No settings to update")

    current = get_site_settings()

    if available_languages is not None:
        next_languages = normalize_available_languages(available_languages)
        if not next_languages:
            raise SiteSettingsError("At least one available language is required")
    else:
        next_languages = current["availableLanguages"]

    removed = [
        code for code in current["availableLanguages"] if code not in next_languages
    ]
    if current["defaultLanguage"] in removed and default_language is None:
        raise SiteSettingsError(
            "The default language cannot be removed. Choose another default first."
        )

    if default_language is not None:
        next_default = str(default_language).strip()
    else:
        next_default = current["defaultLanguage"]
    if next_default not in next_languages:
        raise SiteSettingsError("defaultLanguage must be one of the available languages")

    if admin_language is not None:
        next_admin_language = normalize_admin_language(admin_language)
    else:
        next_admin_language = current["adminLanguage"]

    payload = {
        "availableLanguages": next_languages,
        "adminLanguage": next_admin_language,
        "defaultLanguage": next_default,
    }
    _save_site_settings_file(payload)

    for language in removed:
        remove_language_from_all_pages(language)
        remove_language_from_all_popups(language)
        remove_language_from_all_posts(language)
        remove_language_from_all_bloggers(language)
        remove_language_from_all_blogger_drafts(language)
        remove_language_from_all_blogger_trash(language)

    return payload
