import os

import pytest
from fastapi.testclient import TestClient

from core.config import settings
from core.json_store import (
    JsonStoreCorruptError,
    atomic_write_json,
    read_json_store,
    read_keyed_list,
    write_json_store,
)
from main import app
from services import (
    blogger_draft_service,
    blogger_service,
    blogger_trash_service,
    cms_users_service,
    page_content_service,
    popups_service,
    posts_service,
    posts_trash_service,
    site_settings_service,
)


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "page_admin_enabled", True)
    return tmp_path


def _leftover_temporary_files(directory):
    return [item for item in directory.iterdir() if item.name.endswith(".tmp")]


def test_atomic_write_replaces_content_and_leaves_no_temporary_file(tmp_path):
    target = tmp_path / "store.json"
    target.write_text("old", encoding="utf-8")

    atomic_write_json(target, "new")

    assert target.read_text(encoding="utf-8") == "new"
    assert _leftover_temporary_files(tmp_path) == []


def test_atomic_write_keeps_previous_file_when_replace_fails(tmp_path, monkeypatch):
    target = tmp_path / "store.json"
    target.write_text("old", encoding="utf-8")

    def failing_replace(source, destination):
        raise OSError("disk error")

    monkeypatch.setattr(os, "replace", failing_replace)

    with pytest.raises(OSError):
        atomic_write_json(target, "new")

    assert target.read_text(encoding="utf-8") == "old"
    assert _leftover_temporary_files(tmp_path) == []


def test_atomic_write_creates_missing_parent_directory(tmp_path):
    target = tmp_path / "nested" / "store.json"

    write_json_store(target, {"name": "caf\u00e9"})

    assert read_json_store(target) == {"name": "caf\u00e9"}


def test_read_json_store_returns_none_for_missing_file(tmp_path):
    assert read_json_store(tmp_path / "missing.json") is None


@pytest.mark.parametrize("content", ["", "   ", "{", '{"posts": [', "not json"])
def test_read_json_store_rejects_unparseable_content(tmp_path, content):
    target = tmp_path / "store.json"
    target.write_text(content, encoding="utf-8")

    with pytest.raises(JsonStoreCorruptError):
        read_json_store(target)


def test_read_json_store_rejects_non_utf8_bytes(tmp_path):
    target = tmp_path / "store.json"
    target.write_bytes(b"\xff\xfe\x00bad")

    with pytest.raises(JsonStoreCorruptError):
        read_json_store(target)


def test_corrupt_error_message_does_not_expose_directories(tmp_path):
    target = tmp_path / "secret-dir" / "store.json"
    target.parent.mkdir()
    target.write_text("{", encoding="utf-8")

    with pytest.raises(JsonStoreCorruptError) as raised:
        read_json_store(target)

    assert "secret-dir" not in str(raised.value)


def test_read_keyed_list_shapes(tmp_path):
    target = tmp_path / "store.json"
    assert read_keyed_list(target, "items") == []

    target.write_text('{"items": [1, {"a": 2}]}', encoding="utf-8")
    assert read_keyed_list(target, "items") == [1, {"a": 2}]

    target.write_text("{}", encoding="utf-8")
    assert read_keyed_list(target, "items") == []

    for content in ('{"items": "oops"}', "[]", "null"):
        target.write_text(content, encoding="utf-8")
        with pytest.raises(JsonStoreCorruptError):
            read_keyed_list(target, "items")


STORE_LOADERS = [
    ("posts_file", posts_service._load_store),
    ("posts_trash_file", posts_trash_service._load_store),
    ("blogger_file", blogger_service._load_store),
    ("blogger_trash_file", blogger_trash_service._load_store),
    ("blogger_drafts_file", blogger_draft_service._load_store),
    ("popups_file", popups_service._load_store),
    ("cms_users_file", cms_users_service._load_store),
]


@pytest.mark.parametrize(
    ("file_attribute", "load_store"),
    STORE_LOADERS,
    ids=[name for name, _ in STORE_LOADERS],
)
def test_list_stores_raise_instead_of_returning_empty_when_corrupt(
    isolated_data, file_attribute, load_store
):
    path = getattr(settings, file_attribute)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"truncated": ', encoding="utf-8")

    with pytest.raises(JsonStoreCorruptError):
        load_store()

    assert path.read_text(encoding="utf-8") == '{"truncated": '


@pytest.mark.parametrize(
    ("file_attribute", "load_store"),
    STORE_LOADERS,
    ids=[name for name, _ in STORE_LOADERS],
)
def test_list_stores_treat_missing_file_as_empty(
    isolated_data, file_attribute, load_store
):
    assert not getattr(settings, file_attribute).exists()
    assert list(load_store().values())[0] == []


def test_cms_user_write_is_refused_and_corrupt_file_is_preserved(isolated_data):
    path = settings.cms_users_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"users": [', encoding="utf-8")

    with pytest.raises(JsonStoreCorruptError):
        cms_users_service.create_cms_user(
            email="editor@example.com",
            pages=["home"],
            name="Editor",
            role="page_admin",
        )

    assert path.read_text(encoding="utf-8") == '{"users": ['


def test_site_admin_can_still_resolve_when_cms_users_store_is_corrupt(isolated_data):
    path = settings.cms_users_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{", encoding="utf-8")

    assert cms_users_service.is_cms_login_allowed("admin@example.com") is True
    identity = cms_users_service.resolve_cms_user("admin@example.com")
    assert identity is not None
    assert identity["role"] == "site_admin"


def test_page_admin_is_denied_when_cms_users_store_is_corrupt(isolated_data):
    cms_users_service.create_cms_user(
        email="editor@example.com",
        pages=["home"],
        name="Editor",
        role="page_admin",
    )
    settings.cms_users_file.write_text("{", encoding="utf-8")

    assert cms_users_service.is_cms_login_allowed("editor@example.com") is False
    assert cms_users_service.resolve_cms_user("editor@example.com") is None


def test_site_settings_read_falls_back_to_defaults_but_write_is_refused(isolated_data):
    path = settings.site_settings_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{", encoding="utf-8")

    assert (
        site_settings_service.get_site_settings()
        == site_settings_service.get_default_site_settings()
    )
    with pytest.raises(JsonStoreCorruptError):
        site_settings_service.save_site_settings(admin_language="ko")

    assert path.read_text(encoding="utf-8") == "{"


def test_page_content_read_falls_back_to_defaults_but_write_is_refused(isolated_data):
    path = settings.page_content_file("home")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{", encoding="utf-8")

    assert page_content_service.get_page_content("home") == (
        page_content_service.get_default_page_content("home")
    )
    with pytest.raises(JsonStoreCorruptError):
        page_content_service.save_page_content("home", {"en": {"title": "Hello"}}, expected_revision=0)

    assert path.read_text(encoding="utf-8") == "{"


def test_corrupt_store_is_reported_as_503_without_leaking_details(isolated_data):
    path = settings.popups_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{", encoding="utf-8")

    response = TestClient(app).get("/api/v1/popups")

    assert response.status_code == 503
    assert response.json() == {"detail": "Data store is temporarily unavailable"}


def test_media_cleanup_is_skipped_when_reference_stores_are_unreadable(
    isolated_data, monkeypatch
):
    from services import media_refs

    deleted: list[str] = []
    monkeypatch.setattr(media_refs, "delete_file", deleted.append)
    path = settings.posts_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{", encoding="utf-8")

    media_refs.cleanup_unused_media(image_ids=[], file_ids=["a" * 36])

    assert deleted == []
