"""Read path for `site_settings.json` (languages and default language).

Kept free of content-service imports so blogger services can read the default
language without importing the cascade code in `site_settings_service`.
"""

import logging
import re

from core.config import settings
from core.json_store import JsonStoreCorruptError, read_json_store


logger = logging.getLogger(__name__)

DEFAULT_AVAILABLE_LANGUAGES = ["en", "ko", "de"]
ADMIN_LANGUAGES = frozenset({"en", "ko", "de"})
DEFAULT_ADMIN_LANGUAGE = "en"

_LANGUAGE_CODE_RE = re.compile(r"^[a-z]{2,3}(-[a-zA-Z0-9]+)*$")


def normalize_available_languages(languages: list[str]) -> list[str]:
    unique: list[str] = []
    for raw in languages:
        code = str(raw).strip()
        if not _LANGUAGE_CODE_RE.match(code) or code in unique:
            continue
        unique.append(code)
    return unique


def normalize_admin_language(value: object) -> str:
    code = str(value).strip().lower()
    if code in ADMIN_LANGUAGES:
        return code
    return DEFAULT_ADMIN_LANGUAGE


def resolve_default_language(available_languages: list[str], stored: object) -> str:
    """Stored default while it is still offered; otherwise `ko` if offered, else the first.

    Files written before `defaultLanguage` existed resolve to `ko`, which was the
    previously hard-coded required language.
    """
    code = str(stored or "").strip()
    if code in available_languages:
        return code
    if "ko" in available_languages:
        return "ko"
    return available_languages[0]


def load_site_settings_file() -> dict | None:
    path = settings.site_settings_file
    try:
        parsed = read_json_store(path)
        if parsed is None:
            return None
        if not isinstance(parsed, dict):
            return None

        languages = parsed.get("availableLanguages", [])
        if not isinstance(languages, list):
            return None

        normalized = normalize_available_languages([str(item) for item in languages])
        if not normalized:
            return None

        return {
            "availableLanguages": normalized,
            "adminLanguage": normalize_admin_language(
                parsed.get("adminLanguage", DEFAULT_ADMIN_LANGUAGE)
            ),
            "defaultLanguage": resolve_default_language(
                normalized, parsed.get("defaultLanguage")
            ),
        }
    except (JsonStoreCorruptError, TypeError, ValueError) as error:
        logger.error("Failed to load site settings: %s", error)
        return None


def get_default_language() -> str:
    stored = load_site_settings_file()
    if stored is None:
        return resolve_default_language(DEFAULT_AVAILABLE_LANGUAGES, None)
    return stored["defaultLanguage"]
