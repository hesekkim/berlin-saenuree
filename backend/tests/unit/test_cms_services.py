import pytest

from core.config import settings
from services import page_content_service, site_settings_service


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    return tmp_path


def test_get_page_content_returns_empty_without_file(isolated_data):
    content = page_content_service.get_page_content("home")
    assert content == {}
    assert not (isolated_data / "data" / "pages" / "home.json").exists()


def test_save_page_content_persists_and_reloads(isolated_data):
    saved = page_content_service.save_page_content(
        "posts",
        {
            "en": {
                "title": "Hello",
                "subtitle": "Sub",
                "description": "Desc",
            }
        },
        expected_revision=0,
    )
    assert saved.revision == 1
    assert saved.content["en"]["title"] == "Hello"
    assert page_content_service.get_page_content("posts")["en"]["title"] == "Hello"


def test_save_site_settings_requires_at_least_one_language(isolated_data):
    with pytest.raises(site_settings_service.SiteSettingsError):
        site_settings_service.save_site_settings(available_languages=[])


def test_save_site_settings_cascades_removed_language(isolated_data):
    page_content_service.save_page_content(
        "home",
        {
            "en": {"title": "EN", "subtitle": "", "description": ""},
            "ko": {"title": "KO", "subtitle": "", "description": ""},
        },
        expected_revision=0,
    )
    site_settings_service.save_site_settings(available_languages=["en", "ko"])

    updated = site_settings_service.save_site_settings(
        available_languages=["en"], default_language="en"
    )
    assert updated["availableLanguages"] == ["en"]
    assert updated["adminLanguage"] == "en"

    content = page_content_service.get_page_content("home")
    assert "en" in content
    assert "ko" not in content


def test_save_site_settings_cascades_removed_language_without_existing_file(
    isolated_data,
):
    assert not (isolated_data / "data" / "pages" / "home.json").exists()

    site_settings_service.save_site_settings(available_languages=["en", "ko"])
    site_settings_service.save_site_settings(
        available_languages=["en"], default_language="en"
    )

    assert page_content_service.get_page_content("home") == {}
    assert not (isolated_data / "data" / "pages" / "home.json").exists()


def test_save_site_settings_allows_removing_english_when_others_remain(
    isolated_data,
):
    site_settings_service.save_site_settings(available_languages=["en", "ko"])
    updated = site_settings_service.save_site_settings(available_languages=["ko"])
    assert updated["availableLanguages"] == ["ko"]


def test_save_admin_language_preserves_available_languages(isolated_data):
    site_settings_service.save_site_settings(
        available_languages=["en", "ja"], default_language="en"
    )
    updated = site_settings_service.save_site_settings(admin_language="ko")
    assert updated["availableLanguages"] == ["en", "ja"]
    assert updated["adminLanguage"] == "ko"

    reloaded = site_settings_service.get_site_settings()
    assert reloaded["adminLanguage"] == "ko"
    assert reloaded["availableLanguages"] == ["en", "ja"]
