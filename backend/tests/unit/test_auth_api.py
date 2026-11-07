from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services import auth_service
from services.auth_service import create_access_token, verify_token
from services import cms_users_service


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "page_admin_enabled", True)
    return tmp_path


def _user(
    email="editor@example.com",
    role="page_admin",
    name="Editor",
    pages=None,
    **overrides,
):
    user = {
        "email": email,
        "name": name,
        "role": role,
        "pages": pages if pages is not None else ["home"],
        "effectivePages": pages if pages is not None else ["home"],
        "adminLanguage": "en",
        "darkMode": None,
    }
    user.update(overrides)
    return user


def test_patch_me_updates_cms_user_preferences(isolated_data):
    cms_users_service.create_cms_user(
        email="editor@example.com",
        name="Editor",
        role="page_admin",
        pages=["home"],
        admin_language="ko",
    )
    app.dependency_overrides[get_current_cms_user] = lambda: _user(
        adminLanguage="ko"
    )
    client = TestClient(app)

    try:
        response = client.patch(
            "/api/v1/auth/me",
            json={"darkMode": True},
        )

        assert response.status_code == 200
        assert response.json()["adminLanguage"] == "ko"
        assert response.json()["darkMode"] is True
        stored = cms_users_service.get_cms_user("editor@example.com")
        assert stored is not None
        assert stored["adminLanguage"] == "ko"
        assert stored["darkMode"] is True
    finally:
        app.dependency_overrides.clear()


def test_patch_me_persists_site_admin_dark_mode(isolated_data):
    app.dependency_overrides[get_current_cms_user] = lambda: _user(
        email="admin@example.com",
        role="site_admin",
        name=None,
        pages=["home"],
        adminLanguage="en",
    )
    client = TestClient(app)

    try:
        response = client.patch(
            "/api/v1/auth/me",
            json={"darkMode": True},
        )

        assert response.status_code == 200
        assert response.json()["role"] == "site_admin"
        assert response.json()["darkMode"] is True
        assert cms_users_service.list_cms_users() == []
        resolved = cms_users_service.resolve_cms_user("admin@example.com")
        assert resolved is not None
        assert resolved["darkMode"] is True
    finally:
        app.dependency_overrides.clear()


def test_patch_me_persists_site_admin_admin_language(isolated_data):
    app.dependency_overrides[get_current_cms_user] = lambda: _user(
        email="admin@example.com",
        role="site_admin",
        name=None,
        pages=["home"],
        adminLanguage="en",
    )
    client = TestClient(app)

    try:
        response = client.patch(
            "/api/v1/auth/me",
            json={"adminLanguage": "ko"},
        )

        assert response.status_code == 200
        assert response.json()["adminLanguage"] == "ko"
        assert response.json()["darkMode"] is None
        resolved = cms_users_service.resolve_cms_user("admin@example.com")
        assert resolved is not None
        assert resolved["adminLanguage"] == "ko"
    finally:
        app.dependency_overrides.clear()


def test_patch_me_requires_at_least_one_preference(isolated_data):
    app.dependency_overrides[get_current_cms_user] = lambda: _user()
    client = TestClient(app)

    try:
        response = client.patch("/api/v1/auth/me", json={})

        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_authenticated_request_returns_a_renewed_token(isolated_data, monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-1234-test-secret-key-1234")
    monkeypatch.setattr(settings, "site_id", "site-a")
    client = TestClient(app)
    now = datetime.now(timezone.utc)
    original_expiration = int((now + timedelta(minutes=1)).timestamp())
    token = jwt.encode(
        {
            "sub": "admin@example.com",
            "iss": settings.jwt_issuer,
            "aud": auth_service.JWT_AUDIENCE,
            "typ": auth_service.JWT_TOKEN_TYPE,
            "exp": original_expiration,
            "iat": int(now.timestamp()),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    renewed_token = response.headers["X-Auth-Token"]
    assert verify_token(renewed_token) == "admin@example.com"
    renewed_payload = jwt.decode(
        renewed_token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        audience=auth_service.JWT_AUDIENCE,
    )
    assert renewed_payload["exp"] > original_expiration
    assert renewed_payload["iss"] == "site-a"


def test_token_from_another_site_is_rejected_by_api(isolated_data, monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-1234-test-secret-key-1234")
    monkeypatch.setattr(settings, "site_id", "site-a")
    token = create_access_token("admin@example.com")
    monkeypatch.setattr(settings, "site_id", "site-b")
    client = TestClient(app)

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401

def test_forbidden_request_does_not_return_a_renewed_token(
    isolated_data, monkeypatch
):
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-1234-test-secret-key-1234")
    cms_users_service.create_cms_user(
        email="editor@example.com",
        name="Editor",
        role="page_admin",
        pages=["home"],
    )
    client = TestClient(app)
    token = create_access_token("editor@example.com")

    response = client.get(
        "/api/v1/admin/popups",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert "X-Auth-Token" not in response.headers