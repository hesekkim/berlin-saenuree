from datetime import datetime, timedelta, timezone

import jwt
import pytest

from core.config import Settings, settings
from services import auth_service

TEST_SECRET = "test-secret-key-1234-test-secret-key-1234"


@pytest.fixture
def isolated_codes(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "debug", True)
    return tmp_path


@pytest.fixture
def jwt_site(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", TEST_SECRET)
    monkeypatch.setattr(settings, "jwt_expiration_minutes", 30)
    monkeypatch.setattr(settings, "site_id", "site-a")
    return settings


def _encode(claims: dict) -> str:
    return jwt.encode(claims, TEST_SECRET, algorithm=settings.jwt_algorithm)


def _valid_claims(**overrides) -> dict:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": "admin@example.com",
        "iss": "site-a",
        "aud": auth_service.JWT_AUDIENCE,
        "typ": auth_service.JWT_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }
    claims.update(overrides)
    return claims


def test_verify_code_accepts_valid_code_once(isolated_codes):
    email = "admin@example.com"
    auth_service._store_verification_code(email, "123456")

    assert auth_service.verify_code(email, "123456") is True
    assert auth_service.verify_code(email, "123456") is False


def test_verify_code_rejects_wrong_code(isolated_codes):
    email = "admin@example.com"
    auth_service._store_verification_code(email, "123456")

    assert auth_service.verify_code(email, "000000") is False


def test_verify_code_invalidates_after_max_attempts(isolated_codes):
    email = "admin@example.com"
    auth_service._store_verification_code(email, "123456")

    for _ in range(auth_service.MAX_VERIFY_ATTEMPTS):
        assert auth_service.verify_code(email, "000000") is False

    assert auth_service.verify_code(email, "123456") is False


def test_verify_code_rejects_expired_code(isolated_codes):
    email = "admin@example.com"
    expired_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    auth_service._save_verification_codes(
        {email: {"code": "123456", "expires_at": expired_at, "attempts": 0}}
    )

    assert auth_service.verify_code(email, "123456") is False


def test_access_token_roundtrip(jwt_site):
    token = auth_service.create_access_token("admin@example.com")

    assert auth_service.verify_token(token) == "admin@example.com"


def test_access_token_carries_site_issuer_audience_and_type(jwt_site):
    token = auth_service.create_access_token("admin@example.com")

    payload = jwt.decode(
        token,
        TEST_SECRET,
        algorithms=[settings.jwt_algorithm],
        audience=auth_service.JWT_AUDIENCE,
    )
    assert payload["iss"] == "site-a"
    assert payload["typ"] == "access"


def test_verify_token_rejects_invalid_token(jwt_site):
    assert auth_service.verify_token("not-a-valid-token") is None


def test_verify_token_rejects_expired_token(jwt_site):
    expired = datetime.now(timezone.utc) - timedelta(minutes=1)
    token = _encode(_valid_claims(iat=expired, exp=expired))

    assert auth_service.verify_token(token) is None


def test_verify_token_rejects_token_issued_for_another_site(jwt_site):
    token = _encode(_valid_claims(iss="site-b"))

    assert auth_service.verify_token(token) is None


def test_token_from_another_site_is_rejected_after_site_id_changes(jwt_site, monkeypatch):
    token = auth_service.create_access_token("admin@example.com")
    monkeypatch.setattr(settings, "site_id", "site-b")

    assert auth_service.verify_token(token) is None


def test_verify_token_rejects_other_audience(jwt_site):
    token = _encode(_valid_claims(aud="other-service"))

    assert auth_service.verify_token(token) is None


def test_verify_token_rejects_wrong_token_type(jwt_site):
    token = _encode(_valid_claims(typ="refresh"))

    assert auth_service.verify_token(token) is None


def test_verify_token_rejects_token_without_site_claims(jwt_site):
    legacy = _encode(
        {
            "sub": "admin@example.com",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
        }
    )

    assert auth_service.verify_token(legacy) is None


def test_verify_token_rejects_token_without_type(jwt_site):
    claims = _valid_claims()
    del claims["typ"]

    assert auth_service.verify_token(_encode(claims)) is None


def test_jwt_issuer_defaults_to_slug_of_app_name():
    config = Settings(admin_emails="admin@example.com", app_name="My Brand, Site!")

    assert config.jwt_issuer == "my-brand-site"


def test_jwt_issuer_prefers_explicit_site_id():
    config = Settings(
        admin_emails="admin@example.com",
        app_name="My Brand",
        site_id="brand-kr",
    )

    assert config.jwt_issuer == "brand-kr"


def test_jwt_secret_shorter_than_32_characters_is_weak():
    config = Settings(admin_emails="admin@example.com", jwt_secret_key="x" * 31)

    assert config.has_weak_jwt_secret is True


def test_jwt_secret_of_32_characters_is_accepted():
    config = Settings(admin_emails="admin@example.com", jwt_secret_key="x" * 32)

    assert config.has_weak_jwt_secret is False
