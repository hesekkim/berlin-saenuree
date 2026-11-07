"""CMS account delegation rules (ticket 019)."""

import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services import cms_users_service, page_catalog
from services.page_catalog import PageNode


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "page_admin_enabled", True)
    monkeypatch.setattr(
        page_catalog,
        "PAGE_TREE",
        (
            PageNode("home"),
            PageNode("news"),
            PageNode("menu"),
        ),
    )
    return tmp_path


def _site_admin(**overrides):
    base = {
        "email": "admin@example.com",
        "name": None,
        "role": "site_admin",
        "pages": ["home", "news", "menu"],
        "effectivePages": ["home", "news", "menu"],
        "adminLanguage": "en",
    }
    base.update(overrides)
    return base


def _page_admin(email="alice@example.com", pages=None, **overrides):
    base = {
        "email": email,
        "name": "Alice",
        "role": "page_admin",
        "pages": pages if pages is not None else ["home"],
        "effectivePages": pages if pages is not None else ["home"],
        "adminLanguage": "en",
    }
    base.update(overrides)
    return base


def _create(email, pages, name="User", role="page_admin"):
    return cms_users_service.create_cms_user(
        email=email,
        pages=pages,
        name=name,
        role=role,
    )


def test_list_site_admin_sees_all(isolated_data):
    _create("alice@example.com", ["home"], name="Alice", role="page_admin")
    _create("bob@example.com", ["news"], name="Bob", role="page_manager")

    listed = cms_users_service.list_cms_users_for_actor(_site_admin())
    assert [user["email"] for user in listed] == [
        "alice@example.com",
        "bob@example.com",
    ]


def test_list_cms_users_intersection_excludes_self(isolated_data):
    _create("alice@example.com", ["home"], name="Alice", role="page_admin")
    _create("bob@example.com", ["home", "news"], name="Bob", role="page_manager")
    _create("carol@example.com", ["news"], name="Carol", role="page_manager")

    listed = cms_users_service.list_cms_users_for_actor(
        _page_admin(email="alice@example.com", pages=["home"])
    )
    assert [user["email"] for user in listed] == ["bob@example.com"]
    assert listed[0]["pages"] == ["home", "news"]


def test_list_page_manager_forbidden(isolated_data):
    with pytest.raises(cms_users_service.CmsUsersForbiddenError):
        cms_users_service.list_cms_users_for_actor(
            {
                "email": "mgr@example.com",
                "role": "page_manager",
                "pages": ["home"],
            }
        )


def test_assignable_pages_scoped_for_page_admin(isolated_data):
    assert cms_users_service.assignable_pages_for_actor(_site_admin()) == [
        "home",
        "news",
        "menu",
    ]
    assert cms_users_service.assignable_pages_for_actor(
        _page_admin(pages=["home", "menu"])
    ) == ["home", "menu"]


def test_page_admin_create_manager_only_within_scope(isolated_data):
    actor = _page_admin(pages=["home"])
    created = cms_users_service.create_cms_user_as_actor(
        actor,
        email="mgr@example.com",
        name="Manager",
        role="page_manager",
        pages=["home"],
    )
    assert created["role"] == "page_manager"
    assert created["pages"] == ["home"]

    with pytest.raises(cms_users_service.CmsUsersForbiddenError):
        cms_users_service.create_cms_user_as_actor(
            actor,
            email="other@example.com",
            name="Other",
            role="page_admin",
            pages=["home"],
        )

    with pytest.raises(cms_users_service.CmsUsersError, match="outside your assignment"):
        cms_users_service.create_cms_user_as_actor(
            actor,
            email="news-mgr@example.com",
            name="News Mgr",
            role="page_manager",
            pages=["news"],
        )


def test_page_admin_update_merge_preserves_outside_pages(isolated_data):
    _create("mgr@example.com", ["home", "news"], name="Mgr", role="page_manager")
    actor = _page_admin(pages=["home"])

    updated = cms_users_service.update_cms_user_as_actor(
        actor,
        "mgr@example.com",
        name="Renamed",
        role="page_manager",
        pages=["home"],
    )
    assert updated is not None
    assert updated["name"] == "Renamed"
    assert updated["pages"] == ["home", "news"]

    # Client omits actor-scope page; outside news must remain.
    updated = cms_users_service.update_cms_user_as_actor(
        actor,
        "mgr@example.com",
        name="Renamed",
        role="page_manager",
        pages=[],
    )
    assert updated is not None
    assert updated["pages"] == ["news"]


def test_page_admin_update_rejects_outside_incoming(isolated_data):
    _create("mgr@example.com", ["home"], name="Mgr", role="page_manager")
    with pytest.raises(cms_users_service.CmsUsersError, match="outside your assignment"):
        cms_users_service.update_cms_user_as_actor(
            _page_admin(pages=["home"]),
            "mgr@example.com",
            name="Mgr",
            role="page_manager",
            pages=["news"],
        )


def test_page_admin_cannot_update_page_admin(isolated_data):
    _create("bob@example.com", ["home"], name="Bob", role="page_admin")
    with pytest.raises(cms_users_service.CmsUsersForbiddenError):
        cms_users_service.update_cms_user_as_actor(
            _page_admin(pages=["home"]),
            "bob@example.com",
            name="Nope",
            role="page_admin",
            pages=["home"],
        )


def test_page_admin_cannot_promote_to_page_admin(isolated_data):
    _create("mgr@example.com", ["home"], name="Mgr", role="page_manager")
    with pytest.raises(cms_users_service.CmsUsersForbiddenError):
        cms_users_service.update_cms_user_as_actor(
            _page_admin(pages=["home"]),
            "mgr@example.com",
            name="Mgr",
            role="page_admin",
            pages=["home"],
        )


def test_page_admin_update_to_zero_deletes(isolated_data):
    _create("mgr@example.com", ["home"], name="Mgr", role="page_manager")
    result = cms_users_service.update_cms_user_as_actor(
        _page_admin(pages=["home"]),
        "mgr@example.com",
        name="Mgr",
        role="page_manager",
        pages=[],
    )
    assert result is None
    assert cms_users_service.get_cms_user("mgr@example.com") is None


def test_page_admin_revoke_removes_only_actor_pages(isolated_data):
    _create("mgr@example.com", ["home", "news"], name="Mgr", role="page_manager")
    cms_users_service.delete_cms_user_as_actor(
        _page_admin(pages=["home"]),
        "mgr@example.com",
    )
    remaining = cms_users_service.get_cms_user("mgr@example.com")
    assert remaining is not None
    assert remaining["pages"] == ["news"]


def test_page_admin_revoke_to_zero_deletes(isolated_data):
    _create("mgr@example.com", ["home"], name="Mgr", role="page_manager")
    cms_users_service.delete_cms_user_as_actor(
        _page_admin(pages=["home"]),
        "mgr@example.com",
    )
    assert cms_users_service.get_cms_user("mgr@example.com") is None


def test_page_admin_cannot_delete_page_admin(isolated_data):
    _create("bob@example.com", ["home"], name="Bob", role="page_admin")
    with pytest.raises(cms_users_service.CmsUsersForbiddenError):
        cms_users_service.delete_cms_user_as_actor(
            _page_admin(pages=["home"]),
            "bob@example.com",
        )


def test_site_admin_update_rejects_empty_pages(isolated_data):
    _create("mgr@example.com", ["home"], name="Mgr", role="page_manager")
    with pytest.raises(cms_users_service.CmsUsersError, match="At least one page"):
        cms_users_service.update_cms_user_as_actor(
            _site_admin(),
            "mgr@example.com",
            name="Mgr",
            role="page_manager",
            pages=[],
        )


def test_site_admin_env_email_not_listed(isolated_data):
    listed = cms_users_service.list_cms_users_for_actor(_site_admin())
    assert all(user["email"] != "admin@example.com" for user in listed)


def test_page_admin_cms_users_api_allowed(isolated_data):
    _create("alice@example.com", ["home"], name="Alice", role="page_admin")
    _create("mgr@example.com", ["home", "news"], name="Mgr", role="page_manager")

    app.dependency_overrides[get_current_cms_user] = lambda: _page_admin(
        email="alice@example.com", pages=["home"]
    )
    client = TestClient(app)
    try:
        listed = client.get("/api/v1/cms-users")
        assert listed.status_code == 200
        assert [row["email"] for row in listed.json()] == ["mgr@example.com"]
        assert listed.json()[0]["pages"] == ["home", "news"]

        assignable = client.get("/api/v1/cms-users/assignable-pages")
        assert assignable.status_code == 200
        assert assignable.json()["pages"] == ["home"]

        created = client.post(
            "/api/v1/cms-users",
            json={
                "email": "new-mgr@example.com",
                "name": "New",
                "role": "page_manager",
                "pages": ["home"],
            },
        )
        assert created.status_code == 201

        forbidden_role = client.post(
            "/api/v1/cms-users",
            json={
                "email": "pa@example.com",
                "name": "PA",
                "role": "page_admin",
                "pages": ["home"],
            },
        )
        assert forbidden_role.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_page_manager_cms_users_api_forbidden(isolated_data):
    app.dependency_overrides[get_current_cms_user] = lambda: {
        "email": "mgr@example.com",
        "name": "Mgr",
        "role": "page_manager",
        "pages": ["home"],
        "effectivePages": ["home"],
        "adminLanguage": "en",
    }
    client = TestClient(app)
    try:
        listed = client.get("/api/v1/cms-users")
        assert listed.status_code == 403
        assignable = client.get("/api/v1/cms-users/assignable-pages")
        assert assignable.status_code == 403
    finally:
        app.dependency_overrides.clear()
