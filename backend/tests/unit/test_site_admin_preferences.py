import json

import pytest

from core.config import settings
from services import cms_users_service, site_settings_service

ADMIN = "admin@example.com"


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", [ADMIN])
    monkeypatch.setattr(settings, "page_admin_enabled", True)
    return tmp_path


def _write_store(payload: dict) -> None:
    path = settings.cms_users_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _read_store() -> dict:
    return json.loads(settings.cms_users_file.read_text(encoding="utf-8"))


def _legacy_site_admin_record(email: str = ADMIN, **overrides) -> dict:
    record = {
        "email": email,
        "name": "Site Admin",
        "role": "page_admin",
        "pages": ["home"],
        "adminLanguage": "ko",
        "darkMode": True,
    }
    record.update(overrides)
    return record


def test_saving_preferences_does_not_create_a_cms_account(isolated_data):
    cms_users_service.update_cms_user_preferences(ADMIN, dark_mode=True)

    stored = _read_store()
    assert stored["users"] == []
    assert stored["siteAdminPreferences"] == {ADMIN: {"darkMode": True}}
    assert cms_users_service.get_cms_user(ADMIN) is None


def test_preferences_are_returned_by_resolve(isolated_data):
    cms_users_service.update_cms_user_preferences(
        ADMIN, admin_language="de", dark_mode=False
    )

    resolved = cms_users_service.resolve_cms_user(ADMIN)

    assert resolved["role"] == "site_admin"
    assert resolved["adminLanguage"] == "de"
    assert resolved["darkMode"] is False


def test_unset_language_falls_back_to_site_settings(isolated_data):
    site_settings_service.save_site_settings(admin_language="ko")

    cms_users_service.update_cms_user_preferences(ADMIN, dark_mode=True)

    resolved = cms_users_service.resolve_cms_user(ADMIN)
    assert resolved["adminLanguage"] == "ko"
    assert resolved["darkMode"] is True


def test_partial_update_keeps_other_preference(isolated_data):
    cms_users_service.update_cms_user_preferences(
        ADMIN, admin_language="de", dark_mode=True
    )

    cms_users_service.update_cms_user_preferences(ADMIN, dark_mode=False)

    resolved = cms_users_service.resolve_cms_user(ADMIN)
    assert resolved["adminLanguage"] == "de"
    assert resolved["darkMode"] is False


def test_revoked_site_admin_cannot_log_in_after_saving_preferences(
    isolated_data, monkeypatch
):
    cms_users_service.update_cms_user_preferences(ADMIN, admin_language="ko")
    monkeypatch.setattr(settings, "admin_emails", ["other-admin@example.com"])

    assert cms_users_service.is_cms_login_allowed(ADMIN) is False
    assert cms_users_service.resolve_cms_user(ADMIN) is None
    assert cms_users_service.list_cms_users() == []


def test_preferences_of_a_revoked_admin_are_ignored_if_readded_as_user(
    isolated_data, monkeypatch
):
    cms_users_service.update_cms_user_preferences(ADMIN, dark_mode=True)
    monkeypatch.setattr(settings, "admin_emails", ["other-admin@example.com"])

    cms_users_service.create_cms_user(
        email=ADMIN, pages=["home"], name="Former Admin", role="page_manager"
    )

    resolved = cms_users_service.resolve_cms_user(ADMIN)
    assert resolved["role"] == "page_manager"
    assert resolved["darkMode"] is None


def test_other_users_do_not_receive_site_admin_preferences(isolated_data):
    cms_users_service.update_cms_user_preferences(ADMIN, dark_mode=True)
    cms_users_service.create_cms_user(
        email="editor@example.com", pages=["home"], name="Editor"
    )

    assert cms_users_service.resolve_cms_user("editor@example.com")["darkMode"] is None


def test_user_writes_keep_site_admin_preferences(isolated_data):
    cms_users_service.update_cms_user_preferences(ADMIN, dark_mode=True)

    cms_users_service.create_cms_user(
        email="editor@example.com", pages=["home"], name="Editor"
    )
    cms_users_service.delete_cms_user("editor@example.com")

    assert _read_store()["siteAdminPreferences"] == {ADMIN: {"darkMode": True}}


def test_legacy_record_is_migrated_on_read_without_listing(isolated_data):
    _write_store({"users": [_legacy_site_admin_record()]})

    assert cms_users_service.list_cms_users() == []
    resolved = cms_users_service.resolve_cms_user(ADMIN)
    assert resolved["adminLanguage"] == "ko"
    assert resolved["darkMode"] is True


def test_legacy_record_is_not_revived_after_admin_revocation(isolated_data, monkeypatch):
    _write_store({"users": [_legacy_site_admin_record()]})
    cms_users_service.migrate_site_admin_preferences()

    monkeypatch.setattr(settings, "admin_emails", ["other-admin@example.com"])

    assert cms_users_service.is_cms_login_allowed(ADMIN) is False
    assert cms_users_service.resolve_cms_user(ADMIN) is None
    assert cms_users_service.list_cms_users() == []


def test_startup_migration_persists_and_is_idempotent(isolated_data):
    other_user = {
        "email": "editor@example.com",
        "name": "Editor",
        "role": "page_admin",
        "pages": ["home"],
        "adminLanguage": "en",
    }
    _write_store({"users": [_legacy_site_admin_record(), other_user]})

    cms_users_service.migrate_site_admin_preferences()
    first = _read_store()
    cms_users_service.migrate_site_admin_preferences()

    assert first["users"] == [other_user]
    assert first["siteAdminPreferences"] == {
        ADMIN: {"adminLanguage": "ko", "darkMode": True}
    }
    assert _read_store() == first


def test_existing_preferences_win_over_a_stale_legacy_record(isolated_data):
    _write_store(
        {
            "users": [_legacy_site_admin_record(adminLanguage="ko", darkMode=True)],
            "siteAdminPreferences": {ADMIN: {"adminLanguage": "de"}},
        }
    )

    resolved = cms_users_service.resolve_cms_user(ADMIN)

    assert resolved["adminLanguage"] == "de"
    assert resolved["darkMode"] is None


def test_record_named_site_admin_for_a_non_admin_email_is_kept_and_reported(
    isolated_data, caplog
):
    stale = _legacy_site_admin_record(email="gone@example.com")
    _write_store({"users": [stale]})

    with caplog.at_level("WARNING"):
        cms_users_service.migrate_site_admin_preferences()

    assert _read_store()["users"] == [stale]
    assert "gone@example.com" in caplog.text
    assert "review cms_users.json" in caplog.text


def test_startup_migration_survives_a_corrupt_store(isolated_data):
    settings.cms_users_file.parent.mkdir(parents=True, exist_ok=True)
    settings.cms_users_file.write_text("{", encoding="utf-8")

    cms_users_service.migrate_site_admin_preferences()

    assert settings.cms_users_file.read_text(encoding="utf-8") == "{"


def test_malformed_preferences_section_is_treated_as_corruption(isolated_data):
    _write_store({"users": [], "siteAdminPreferences": ["oops"]})

    with pytest.raises(cms_users_service.JsonStoreCorruptError):
        cms_users_service.update_cms_user_preferences(ADMIN, dark_mode=True)
