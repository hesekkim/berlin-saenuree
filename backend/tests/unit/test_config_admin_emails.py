import pytest
from pydantic import ValidationError

from core.config import Settings, _parse_admin_emails


def _settings(**kwargs) -> Settings:
    return Settings(
        _env_file=None,
        jwt_secret_key="unit-test-secret-key",
        **kwargs,
    )


def test_parse_admin_emails_trims_and_lowercases():
    assert _parse_admin_emails("  Admin@Example.com , other@x.com ") == [
        "admin@example.com",
        "other@x.com",
    ]


def test_parse_admin_emails_rejects_empty():
    with pytest.raises(ValueError, match="at least one"):
        _parse_admin_emails("")
    with pytest.raises(ValueError, match="at least one"):
        _parse_admin_emails("  ,  ")


def test_parse_admin_emails_rejects_invalid():
    with pytest.raises(ValueError, match="Invalid admin email"):
        _parse_admin_emails("not-an-email")


def test_single_admin_email_ok():
    settings = _settings(admin_emails="admin@example.com")
    assert settings.admin_emails == ["admin@example.com"]
    assert settings.is_site_admin_email("Admin@Example.com") is True
    assert settings.page_admin_enabled is False


def test_multiple_admin_emails_always_allowed():
    settings = _settings(admin_emails="a@example.com, b@example.com")
    assert settings.admin_emails == ["a@example.com", "b@example.com"]
    assert settings.is_site_admin_email("b@example.com") is True
    assert settings.is_site_admin_email("c@example.com") is False


def test_page_admin_enabled_flag():
    settings = _settings(
        admin_emails="admin@example.com",
        page_admin_enabled=True,
    )
    assert settings.page_admin_enabled is True


def test_admin_emails_missing_fails():
    with pytest.raises(ValidationError):
        _settings()
