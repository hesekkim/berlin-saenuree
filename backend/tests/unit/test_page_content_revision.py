"""Page content revisions: optimistic locking, legacy file migration, language cascade."""

import json

import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import require_page_editor
from core.config import settings
from main import app
from services import page_content_service
from services.page_content_service import PageContentConflictError

COPY_EN = {"title": "Hello", "subtitle": "", "description": ""}
COPY_KO = {"title": "안녕", "subtitle": "", "description": ""}


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    return tmp_path


def _page_path(slug: str = "home"):
    return settings.page_content_file(slug)


def _write_legacy(language_map: dict) -> None:
    path = _page_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(language_map), encoding="utf-8")


def test_missing_page_starts_at_revision_zero(isolated_data):
    document = page_content_service.get_page_document("home")

    assert document.revision == 0
    assert document.content == {}


def test_each_save_increments_the_revision(isolated_data):
    first = page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)
    second = page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=1)

    assert (first.revision, second.revision) == (1, 2)
    stored = json.loads(_page_path().read_text(encoding="utf-8"))
    assert stored == {"contentRevision": 2, "content": {"en": COPY_EN}}


def test_stale_revision_is_rejected_and_keeps_the_newer_save(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)
    page_content_service.save_page_content("home", {"en": {"title": "Newer", "subtitle": "", "description": ""}}, expected_revision=1)

    with pytest.raises(PageContentConflictError) as error:
        page_content_service.save_page_content("home", {"ko": COPY_KO}, expected_revision=1)

    assert error.value.current.revision == 2
    assert error.value.current.content["en"]["title"] == "Newer"
    assert page_content_service.get_page_content("home") == {
        "en": {"title": "Newer", "subtitle": "", "description": ""}
    }


def test_legacy_language_map_is_read_as_revision_one(isolated_data):
    _write_legacy({"en": COPY_EN})

    document = page_content_service.get_page_document("home")

    assert document.revision == 1
    assert document.content == {"en": COPY_EN}


def test_legacy_file_is_rewritten_in_the_new_format_on_next_save(isolated_data):
    _write_legacy({"en": COPY_EN})

    saved = page_content_service.save_page_content(
        "home", {"en": COPY_EN, "ko": COPY_KO}, expected_revision=1
    )

    assert saved.revision == 2
    stored = json.loads(_page_path().read_text(encoding="utf-8"))
    assert stored == {"contentRevision": 2, "content": {"en": COPY_EN, "ko": COPY_KO}}


def test_stale_editor_against_a_legacy_file_is_rejected(isolated_data):
    _write_legacy({"en": COPY_EN})

    with pytest.raises(PageContentConflictError):
        page_content_service.save_page_content("home", {"ko": COPY_KO}, expected_revision=0)


def test_removing_a_language_bumps_the_revision(isolated_data):
    page_content_service.save_page_content(
        "home", {"en": COPY_EN, "ko": COPY_KO}, expected_revision=0
    )

    page_content_service.remove_language_from_all_pages("ko")

    document = page_content_service.get_page_document("home")
    assert document.revision == 2
    assert "ko" not in document.content


def test_removing_a_language_absent_from_a_page_keeps_its_revision(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)

    page_content_service.remove_language_from_all_pages("ko")

    assert page_content_service.get_page_document("home").revision == 1


def test_put_with_stale_revision_returns_409_with_current_content(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)
    app.dependency_overrides[require_page_editor] = lambda: {"email": "admin@example.com", "role": "site_admin"}
    client = TestClient(app)
    try:
        response = client.put(
            "/api/v1/pages/home",
            json={"contentRevision": 0, "content": {"ko": COPY_KO}},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    body = response.json()
    assert body["contentRevision"] == 1
    assert body["content"] == {"en": COPY_EN}


def test_put_requires_a_revision(isolated_data):
    app.dependency_overrides[require_page_editor] = lambda: {"email": "admin@example.com", "role": "site_admin"}
    client = TestClient(app)
    try:
        response = client.put("/api/v1/pages/home", json={"content": {"en": COPY_EN}})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_get_exposes_the_revision(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)

    response = TestClient(app).get("/api/v1/pages/home")

    assert response.status_code == 200
    assert response.json()["contentRevision"] == 1
