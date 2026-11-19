import pytest

from core.config import settings
from services import cms_users_service, page_catalog


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "page_admin_enabled", True)
    return tmp_path


def _create(
    email="editor@example.com",
    pages=None,
    name="Editor",
    role="page_admin",
    admin_language=None,
):
    kwargs = {
        "email": email,
        "pages": pages if pages is not None else ["home"],
        "name": name,
        "role": role,
    }
    if admin_language is not None:
        kwargs["admin_language"] = admin_language
    return cms_users_service.create_cms_user(**kwargs)


def test_create_cms_user_requires_at_least_one_page(isolated_data):
    with pytest.raises(cms_users_service.CmsUsersError):
        _create(pages=[])


def test_create_requires_name(isolated_data):
    with pytest.raises(cms_users_service.CmsUsersError, match="Name is required"):
        _create(name="   ")


def test_create_rejects_invalid_role(isolated_data):
    with pytest.raises(cms_users_service.CmsUsersError, match="Invalid role"):
        _create(role="site_admin")


def test_create_and_list_cms_user(isolated_data):
    created = _create(
        email="Editor@Example.com",
        name="  Alex Kim  ",
        role="page_manager",
        admin_language="ko",
    )
    assert created["email"] == "editor@example.com"
    assert created["name"] == "Alex Kim"
    assert created["role"] == "page_manager"
    assert created["pages"] == ["home"]
    assert created["adminLanguage"] == "ko"

    listed = cms_users_service.list_cms_users()
    assert len(listed) == 1
    assert listed[0]["email"] == "editor@example.com"
    assert listed[0]["name"] == "Alex Kim"
    assert listed[0]["role"] == "page_manager"


def test_cannot_create_cms_user_for_site_admin_email(isolated_data):
    with pytest.raises(cms_users_service.CmsUsersError):
        _create(email="admin@example.com")


def test_cannot_create_cms_user_for_any_site_admin_email(isolated_data, monkeypatch):
    monkeypatch.setattr(
        settings,
        "admin_emails",
        ["admin@example.com", "coadmin@example.com"],
    )
    with pytest.raises(cms_users_service.CmsUsersError):
        _create(email="coadmin@example.com")


def test_resolve_any_site_admin_email(isolated_data, monkeypatch):
    monkeypatch.setattr(
        settings,
        "admin_emails",
        ["admin@example.com", "coadmin@example.com"],
    )
    resolved = cms_users_service.resolve_cms_user("CoAdmin@Example.com")
    assert resolved is not None
    assert resolved["role"] == "site_admin"
    assert resolved["email"] == "coadmin@example.com"
    assert resolved["name"] is None


def test_cms_user_login_blocked_when_feature_disabled(isolated_data, monkeypatch):
    _create()
    monkeypatch.setattr(settings, "page_admin_enabled", False)

    assert cms_users_service.is_cms_login_allowed("editor@example.com") is False
    assert cms_users_service.resolve_cms_user("editor@example.com") is None
    assert cms_users_service.is_cms_login_allowed("admin@example.com") is True
    assert cms_users_service.resolve_cms_user("admin@example.com") is not None


def test_duplicate_cms_user_rejected(isolated_data):
    _create()
    with pytest.raises(cms_users_service.CmsUsersError):
        _create()


def test_update_cms_user_and_delete(isolated_data):
    _create(name="Editor")
    updated = cms_users_service.update_cms_user(
        "editor@example.com",
        name="Updated Name",
        role="page_manager",
        pages=["home"],
    )
    assert updated["name"] == "Updated Name"
    assert updated["role"] == "page_manager"
    assert updated["pages"] == ["home"]
    assert updated["email"] == "editor@example.com"

    cms_users_service.delete_cms_user("editor@example.com")
    assert cms_users_service.get_cms_user("editor@example.com") is None
    assert cms_users_service.is_cms_login_allowed("editor@example.com") is False


def test_update_pages_keeps_name_and_role(isolated_data):
    _create(name="Keep Me", role="page_manager")
    updated = cms_users_service.update_cms_user_pages(
        "editor@example.com", ["home"]
    )
    assert updated["name"] == "Keep Me"
    assert updated["role"] == "page_manager"


def test_resolve_cms_user_immediate_after_delete(isolated_data):
    _create()
    assert cms_users_service.resolve_cms_user("editor@example.com") is not None

    cms_users_service.delete_cms_user("editor@example.com")
    assert cms_users_service.resolve_cms_user("editor@example.com") is None


def test_cms_user_language_update(isolated_data):
    _create(admin_language="en")
    updated = cms_users_service.update_cms_user_language(
        "editor@example.com", "de"
    )
    assert updated["adminLanguage"] == "de"
    resolved = cms_users_service.resolve_cms_user("editor@example.com")
    assert resolved is not None
    assert resolved["adminLanguage"] == "de"
    assert resolved["role"] == "page_admin"
    assert resolved["name"] == "Editor"


def test_legacy_cms_user_dark_mode_defaults_to_null(isolated_data):
    path = settings.cms_users_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '{"users":[{"email":"legacy@example.com","name":"Legacy","role":"page_admin","pages":["home"],"adminLanguage":"en"}]}',
        encoding="utf-8",
    )

    user = cms_users_service.get_cms_user("legacy@example.com")
    assert user is not None
    assert user["darkMode"] is None

    resolved = cms_users_service.resolve_cms_user("legacy@example.com")
    assert resolved is not None
    assert resolved["darkMode"] is None


def test_update_cms_user_preferences_preserves_unspecified_values(isolated_data):
    _create(admin_language="ko")

    updated = cms_users_service.update_cms_user_preferences(
        "editor@example.com",
        dark_mode=True,
    )

    assert updated["adminLanguage"] == "ko"
    assert updated["darkMode"] is True

    resolved = cms_users_service.resolve_cms_user("editor@example.com")
    assert resolved is not None
    assert resolved["adminLanguage"] == "ko"
    assert resolved["darkMode"] is True


def test_site_admin_reads_legacy_preference_record_without_listing_it(isolated_data):
    path = settings.cms_users_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '{"users":[{"email":"admin@example.com","name":"Site Admin","role":"page_admin","pages":["home"],"adminLanguage":"en","darkMode":true}]}',
        encoding="utf-8",
    )

    assert cms_users_service.list_cms_users() == []

    resolved = cms_users_service.resolve_cms_user("admin@example.com")
    assert resolved is not None
    assert resolved["role"] == "site_admin"
    assert resolved["darkMode"] is True


def test_resolve_uses_stored_role(isolated_data):
    _create(role="page_manager", name="Manager")
    resolved = cms_users_service.resolve_cms_user("editor@example.com")
    assert resolved is not None
    assert resolved["role"] == "page_manager"
    assert resolved["name"] == "Manager"


def test_admin_resolve_uses_env_email(isolated_data):
    resolved = cms_users_service.resolve_cms_user("admin@example.com")
    assert resolved is not None
    assert resolved["role"] == "site_admin"
    assert resolved["name"] is None
    assert "home" in resolved["effectivePages"]


def test_users_without_name_or_role_are_skipped(isolated_data):
    path = settings.cms_users_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '{"users":[{"email":"legacy@example.com","pages":["home"],'
        '"adminLanguage":"en"}]}',
        encoding="utf-8",
    )
    assert cms_users_service.list_cms_users() == []
    assert cms_users_service.get_cms_user("legacy@example.com") is None


def test_expand_page_access_includes_descendants(monkeypatch):
    from services.page_catalog import PageNode

    tree = (
        PageNode(
            "menu",
            children=(
                PageNode("lunch-menu"),
                PageNode("dinner-menu"),
            ),
        ),
    )
    monkeypatch.setattr(page_catalog, "PAGE_TREE", tree)

    allowed = page_catalog.expand_page_access(["menu"])
    assert allowed == frozenset({"menu", "lunch-menu", "dinner-menu"})
    assert page_catalog.can_access_page(["menu"], "lunch-menu") is True
    assert page_catalog.can_access_page(["menu"], "home") is False


def test_assignable_slugs_are_top_level_only(monkeypatch):
    from services.page_catalog import PageNode

    tree = (
        PageNode(
            "menu",
            children=(PageNode("lunch-menu"),),
        ),
        PageNode("home"),
    )
    monkeypatch.setattr(page_catalog, "PAGE_TREE", tree)

    assert page_catalog.assignable_slugs() == ["menu", "home"]
    assert "lunch-menu" not in page_catalog.assignable_slugs()


def test_member_directory_is_assignable_but_not_page_content():
    from services.page_content_service import is_allowed_slug

    assert "members" in page_catalog.assignable_slugs()
    assert is_allowed_slug("members") is False
    assert "members" in cms_users_service.assignable_pages_for_actor(
        {"role": "site_admin"}
    )


def _menu_tree_with_lunch():
    from services.page_catalog import PageNode

    return (
        PageNode(
            "menu",
            children=(PageNode("lunch-menu"),),
        ),
    )


def test_create_rejects_subpage_assignment(isolated_data, monkeypatch):
    monkeypatch.setattr(page_catalog, "PAGE_TREE", _menu_tree_with_lunch())

    with pytest.raises(cms_users_service.CmsUsersError, match="not subpages"):
        _create(pages=["lunch-menu"])


def test_update_rejects_subpage_assignment(isolated_data, monkeypatch):
    monkeypatch.setattr(page_catalog, "PAGE_TREE", _menu_tree_with_lunch())
    _create(pages=["menu"])

    with pytest.raises(cms_users_service.CmsUsersError, match="not subpages"):
        cms_users_service.update_cms_user_pages(
            "editor@example.com",
            ["lunch-menu"],
        )


def test_create_rejects_unknown_slug(isolated_data, monkeypatch):
    monkeypatch.setattr(page_catalog, "PAGE_TREE", _menu_tree_with_lunch())

    with pytest.raises(cms_users_service.CmsUsersError, match="Unknown page slug"):
        _create(pages=["hme"])


def test_require_assignable_pages_strips_whitespace(isolated_data):
    normalized = cms_users_service.require_assignable_pages(["  home  "])
    assert normalized == ["home"]


def test_main_assignment_expands_in_resolve(isolated_data, monkeypatch):
    monkeypatch.setattr(page_catalog, "PAGE_TREE", _menu_tree_with_lunch())

    _create(pages=["menu"])
    resolved = cms_users_service.resolve_cms_user("editor@example.com")
    assert resolved is not None
    assert resolved["pages"] == ["menu"]
    assert set(resolved["effectivePages"]) == {"menu", "lunch-menu"}
