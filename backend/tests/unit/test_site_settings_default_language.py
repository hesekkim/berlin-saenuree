import json

import pytest

from core.config import settings
from core.json_store import read_json_store
from services.blogger_draft_service import upsert_draft_for_user
from services.blogger_service import BloggerValidationError, create_blogger
from services.blogger_trash_service import move_to_trash
from services.site_settings_service import (
    SiteSettingsError,
    get_site_settings,
    save_site_settings,
)
from services.site_settings_store import resolve_default_language


ADMIN = "admin@example.com"


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", [ADMIN])
    return tmp_path


def _write_legacy_settings(languages: list[str]) -> None:
    path = settings.site_settings_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"availableLanguages": languages, "adminLanguage": "en"}),
        encoding="utf-8",
    )


def _copy(title: str) -> dict[str, str]:
    return {"title": title, "body": f"<p>{title} body</p>"}


def _blogger_payload(languages: list[str]) -> dict:
    return {
        "published": False,
        "copies": {code: _copy(code.upper()) for code in languages},
    }


def test_resolve_default_language_keeps_stored_when_still_offered():
    assert resolve_default_language(["en", "de"], "de") == "de"


def test_resolve_default_language_falls_back_to_ko_then_first():
    assert resolve_default_language(["en", "ko", "de"], "fr") == "ko"
    assert resolve_default_language(["en", "de"], None) == "en"


def test_legacy_settings_without_default_language_resolve_to_ko(isolated_data):
    _write_legacy_settings(["en", "ko", "de"])

    assert get_site_settings()["defaultLanguage"] == "ko"


def test_default_language_can_be_changed_to_an_available_language(isolated_data):
    save_site_settings(available_languages=["en", "ko", "de"])

    payload = save_site_settings(default_language="en")

    assert payload["defaultLanguage"] == "en"
    assert get_site_settings()["defaultLanguage"] == "en"


def test_default_language_must_be_an_available_language(isolated_data):
    save_site_settings(available_languages=["en", "ko"])

    with pytest.raises(SiteSettingsError, match="must be one of the available"):
        save_site_settings(default_language="de")


def test_default_language_cannot_be_removed_without_switching(isolated_data):
    save_site_settings(available_languages=["en", "ko", "de"])

    with pytest.raises(SiteSettingsError, match="cannot be removed"):
        save_site_settings(available_languages=["en", "de"])


def test_removing_default_language_with_new_default_cascades(isolated_data):
    save_site_settings(available_languages=["en", "ko", "de"])
    create_blogger(
        _blogger_payload(["en", "ko", "de"]),
        created_by=ADMIN,
        role="site_admin",
    )

    payload = save_site_settings(available_languages=["en", "de"], default_language="en")

    assert payload["defaultLanguage"] == "en"
    assert payload["availableLanguages"] == ["en", "de"]


def test_removing_a_language_cascades_to_blogger_drafts_and_trash(isolated_data):
    save_site_settings(available_languages=["en", "ko", "de"])
    blogger = create_blogger(
        _blogger_payload(["en", "ko", "de"]),
        created_by=ADMIN,
        role="site_admin",
    )
    upsert_draft_for_user(
        {"copies": {"en": _copy("EN"), "de": _copy("DE")}},
        email=ADMIN,
    )
    move_to_trash(blogger["id"], deleted_by=ADMIN, role="site_admin")

    save_site_settings(available_languages=["en", "ko"])

    trash_items = read_json_store(settings.blogger_trash_file)["items"]
    assert trash_items[0]["blogger"]["id"] == blogger["id"]
    assert set(trash_items[0]["blogger"]["copies"]) == {"en", "ko"}
    draft = read_json_store(settings.blogger_drafts_file)["drafts"][0]
    assert set(draft["copies"]) == {"en"}


def test_blogger_requires_the_site_default_copy(isolated_data):
    save_site_settings(available_languages=["en", "ko", "de"], default_language="en")

    with pytest.raises(BloggerValidationError, match="en title and body are required"):
        create_blogger(
            _blogger_payload(["ko", "de"]),
            created_by=ADMIN,
            role="site_admin",
        )

