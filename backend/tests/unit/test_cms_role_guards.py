"""page_manager auth and cms-users access (ticket 018)."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user, require_page_editor
from core.config import settings
from main import app
from services import cms_users_service, page_catalog


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "page_admin_enabled", True)
    return tmp_path


def _manager_user(**overrides):
    base = {
        "email": "manager@example.com",
        "name": "Manager",
        "role": "page_manager",
        "pages": ["home"],
        "effectivePages": ["home"],
        "adminLanguage": "en",
    }
    base.update(overrides)
    return base


def test_page_manager_login_and_resolve_allowed(isolated_data):
    cms_users_service.create_cms_user(
        email="manager@example.com",
        name="Manager",
        role="page_manager",
        pages=["home"],
    )

    assert cms_users_service.is_cms_login_allowed("manager@example.com") is True
    resolved = cms_users_service.resolve_cms_user("manager@example.com")
    assert resolved is not None
    assert resolved["role"] == "page_manager"
    assert "home" in resolved["effectivePages"]


def test_page_manager_login_blocked_when_feature_disabled(
    isolated_data, monkeypatch
):
    cms_users_service.create_cms_user(
        email="manager@example.com",
        name="Manager",
        role="page_manager",
        pages=["home"],
    )
    monkeypatch.setattr(settings, "page_admin_enabled", False)

    assert cms_users_service.is_cms_login_allowed("manager@example.com") is False
    assert cms_users_service.resolve_cms_user("manager@example.com") is None
    assert cms_users_service.is_cms_login_allowed("admin@example.com") is True


def test_page_manager_require_page_editor_allows_assigned_slug(isolated_data):
    user = _manager_user()
    assert require_page_editor(slug="home", user=user) is user


def test_page_manager_can_edit_assigned_visit_page(isolated_data):
    user = _manager_user(pages=["visit"], effectivePages=["visit"])
    assert require_page_editor(slug="visit", user=user) is user


def test_page_manager_require_page_editor_rejects_unassigned_slug(isolated_data):
    user = _manager_user(effectivePages=["home"])
    with pytest.raises(HTTPException) as exc_info:
        require_page_editor(slug="unknown-page", user=user)
    assert exc_info.value.status_code == 403


def test_page_manager_require_page_editor_expands_subpages(
    isolated_data, monkeypatch
):
    from services.page_catalog import PageNode

    tree = (
        PageNode(
            "menu",
            children=(PageNode("lunch-menu"),),
        ),
    )
    monkeypatch.setattr(page_catalog, "PAGE_TREE", tree)

    cms_users_service.create_cms_user(
        email="manager@example.com",
        name="Manager",
        role="page_manager",
        pages=["menu"],
    )
    resolved = cms_users_service.resolve_cms_user("manager@example.com")
    assert resolved is not None

    assert require_page_editor(slug="lunch-menu", user=resolved) is resolved


def test_page_manager_cms_users_api_forbidden(isolated_data):
    """page_manager must get 403 on every cms-users route (survives 019 guard changes)."""
    app.dependency_overrides[get_current_cms_user] = lambda: _manager_user()
    client = TestClient(app)
    payload = {
        "email": "new@example.com",
        "name": "New User",
        "role": "page_manager",
        "pages": ["home"],
    }
    update = {
        "name": "Renamed",
        "role": "page_manager",
        "pages": ["home"],
    }

    try:
        assert client.get("/api/v1/cms-users").status_code == 403
        assert client.get("/api/v1/cms-users/assignable-pages").status_code == 403
        assert client.post("/api/v1/cms-users", json=payload).status_code == 403
        assert (
            client.put("/api/v1/cms-users/manager%40example.com", json=update).status_code
            == 403
        )
        assert (
            client.delete("/api/v1/cms-users/manager%40example.com").status_code == 403
        )
    finally:
        app.dependency_overrides.clear()
