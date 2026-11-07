"""popups_service (ticket 024)."""

from datetime import datetime, timedelta, timezone
from io import BytesIO

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services import popups_service
from services.image_optimize_service import optimize_image_bytes
from services.popups_service import (
    PopupsNotFoundError,
    PopupsValidationError,
    create_popup,
    delete_popup,
    is_published,
    list_popups,
    list_published_popups,
    remove_language_from_all_popups,
    reorder_popups,
    to_published_response,
    update_popup,
)


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "media_max_file_bytes", 5 * 1024 * 1024)
    return tmp_path


def _site_admin():
    return {
        "email": "admin@example.com",
        "name": None,
        "role": "site_admin",
        "pages": [],
        "effectivePages": [],
        "adminLanguage": "en",
    }


def _page_admin():
    return {
        "email": "page@example.com",
        "name": "Page",
        "role": "page_admin",
        "pages": ["home"],
        "effectivePages": ["home"],
        "adminLanguage": "en",
    }


def _png_bytes(width: int = 80, height: int = 60) -> bytes:
    image = Image.new("RGB", (width, height), color=(30, 140, 200))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _make_image_id() -> str:
    return optimize_image_bytes(
        _png_bytes(),
        content_type="image/png",
    )["imageId"]


def _notice_payload(**overrides):
    payload = {
        "name": "Test notice",
        "type": "notice",
        "enabled": True,
        "sortOrder": 0,
        "copies": {"en": {"title": "Hello", "body": "World"}},
    }
    payload.update(overrides)
    return payload


def test_create_list_and_limit(isolated_data):
    for index in range(4):
        create_popup(
            _notice_payload(
                name=f"Notice {index}",
                sortOrder=index,
                copies={"en": {"title": str(index), "body": "x"}},
            )
        )
    assert len(list_popups()) == 4
    with pytest.raises(PopupsValidationError):
        create_popup(_notice_payload())


def test_create_defaults_enabled_on(isolated_data):
    created = create_popup(
        {
            "name": "Default on",
            "type": "notice",
            "copies": {"en": {"title": "Hi", "body": "x"}},
        }
    )
    assert created["enabled"] is True


def test_name_required(isolated_data):
    with pytest.raises(PopupsValidationError):
        create_popup(_notice_payload(name="  "))


def test_poster_requires_image_id(isolated_data):
    with pytest.raises(PopupsValidationError):
        create_popup(
            {
                "name": "Poster",
                "type": "poster",
                "enabled": True,
                "sortOrder": 0,
                "copies": {},
            }
        )


def test_rejects_unknown_image_id(isolated_data):
    with pytest.raises(PopupsValidationError, match="imageId"):
        create_popup(
            _notice_payload(
                imageId="00000000-0000-0000-0000-000000000099",
            )
        )


def test_notice_requires_text(isolated_data):
    with pytest.raises(PopupsValidationError):
        create_popup(
            _notice_payload(copies={"en": {"title": "", "body": ""}})
        )


def test_type_immutable_on_update(isolated_data):
    created = create_popup(_notice_payload(name="Keep type"))
    updated = update_popup(
        created["id"],
        {
            **_notice_payload(name="Renamed"),
            "type": "poster",
        },
    )
    assert updated["type"] == "notice"
    assert updated["name"] == "Renamed"


def test_update_preserves_sort_order(isolated_data):
    first = create_popup(_notice_payload(copies={"en": {"title": "A", "body": "x"}}))
    second = create_popup(_notice_payload(copies={"en": {"title": "B", "body": "x"}}))
    reorder_popups([second["id"], first["id"]])
    updated = update_popup(
        first["id"],
        _notice_payload(name="Edited", sortOrder=99),
    )
    assert updated["sortOrder"] == 1
    assert updated["name"] == "Edited"


def test_published_filter_and_schedule(isolated_data):
    now = datetime(2026, 9, 9, 12, 0, tzinfo=timezone.utc)
    create_popup(_notice_payload(enabled=False, copies={"en": {"title": "off", "body": "x"}}))
    create_popup(
        _notice_payload(
            enabled=True,
            startsAt=(now + timedelta(days=1)).isoformat(),
            copies={"en": {"title": "future", "body": "x"}},
        )
    )
    create_popup(
        _notice_payload(
            enabled=True,
            sortOrder=1,
            copies={"en": {"title": "live", "body": "x"}},
        )
    )
    published = list_published_popups(now=now)
    assert len(published) == 1
    assert "live" in published[0]["copies"]["en"]["body"]
    assert "title" not in published[0]["copies"]["en"]


def test_is_published_respects_ends_at(isolated_data):
    now = datetime(2026, 9, 9, 12, 0, tzinfo=timezone.utc)
    create_popup(
        _notice_payload(
            endsAt=(now - timedelta(seconds=1)).isoformat(),
            copies={"en": {"title": "ended", "body": "x"}},
        )
    )
    assert list_published_popups(now=now) == []


def test_is_published_naive_datetime_coerced():
    now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    assert is_published(
        {
            "enabled": True,
            "type": "notice",
            "startsAt": "2026-01-01T00:00:00",
            "endsAt": "2026-01-02T00:00:00",
            "copies": {"en": {"title": "Hi", "body": ""}},
        },
        now=now,
    )
    assert not is_published(
        {
            "enabled": True,
            "type": "notice",
            "startsAt": "not-a-date",
            "endsAt": None,
            "copies": {"en": {"title": "Hi", "body": ""}},
        },
        now=now,
    )


def test_ends_at_keeps_microseconds(isolated_data):
    created = create_popup(
        _notice_payload(
            endsAt="2026-09-09T21:59:59.999000+00:00",
        )
    )
    assert ".999" in str(created["endsAt"])


def test_update_bumps_content_revision(isolated_data):
    created = create_popup(_notice_payload())
    assert created["contentRevision"] == 1
    updated = update_popup(
        created["id"],
        _notice_payload(copies={"en": {"title": "Changed", "body": "World"}}),
    )
    assert updated["contentRevision"] == 2


def test_delete_and_language_cascade(isolated_data):
    created = create_popup(
        _notice_payload(copies={"en": {"title": "A", "body": "1"}, "ko": {"title": "가", "body": "1"}})
    )
    remove_language_from_all_popups("ko")
    popup = popups_service.get_popup(created["id"])
    assert "ko" not in popup["copies"]
    assert "en" in popup["copies"]
    assert popup["enabled"] is True
    delete_popup(created["id"])
    with pytest.raises(PopupsNotFoundError):
        popups_service.get_popup(created["id"])


def test_language_cascade_disables_notice_when_text_emptied(isolated_data):
    created = create_popup(
        _notice_payload(
            enabled=True,
            copies={"ko": {"title": "가", "body": "1"}, "en": {"title": "", "body": ""}},
        )
    )
    remove_language_from_all_popups("ko")
    popup = popups_service.get_popup(created["id"])
    assert "ko" not in popup["copies"]
    assert popup["enabled"] is False
    assert list_published_popups() == []


def test_is_published_skips_empty_notice_content():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    empty_notice = {
        "enabled": True,
        "type": "notice",
        "startsAt": None,
        "endsAt": None,
        "imageId": None,
        "copies": {"en": {"title": "", "body": ""}},
    }
    assert not is_published(empty_notice, now=now)
    with_image = {**empty_notice, "imageId": "img-1"}
    assert is_published(with_image, now=now)


def test_is_published_helper():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert is_published(
        {
            "enabled": True,
            "type": "notice",
            "startsAt": None,
            "endsAt": None,
            "copies": {"en": {"title": "Hi", "body": ""}},
        },
        now=now,
    )
    assert not is_published(
        {
            "enabled": False,
            "type": "notice",
            "startsAt": None,
            "endsAt": None,
            "copies": {"en": {"title": "Hi", "body": ""}},
        },
        now=now,
    )


def test_reorder_popups(isolated_data):
    first = create_popup(_notice_payload(copies={"en": {"title": "A", "body": "x"}}))
    second = create_popup(_notice_payload(copies={"en": {"title": "B", "body": "x"}}))
    third = create_popup(_notice_payload(copies={"en": {"title": "C", "body": "x"}}))
    reordered = reorder_popups([third["id"], first["id"], second["id"]])
    assert [item["id"] for item in reordered] == [third["id"], first["id"], second["id"]]
    assert [item["sortOrder"] for item in reordered] == [0, 1, 2]
    with pytest.raises(PopupsValidationError):
        reorder_popups([first["id"], second["id"]])


def test_admin_api_requires_site_admin(isolated_data):
    app.dependency_overrides[get_current_cms_user] = _page_admin
    client = TestClient(app)
    try:
        assert client.get("/api/v1/admin/popups").status_code == 403
        assert client.post("/api/v1/admin/popups", json=_notice_payload()).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_public_and_admin_api(isolated_data):
    app.dependency_overrides[get_current_cms_user] = _site_admin
    client = TestClient(app)
    try:
        created = client.post("/api/v1/admin/popups", json=_notice_payload(enabled=True))
        assert created.status_code == 201
        popup_id = created.json()["id"]

        public = client.get("/api/v1/popups")
        assert public.status_code == 200
        body = public.json()
        assert len(body) == 1
        assert "name" not in body[0]
        assert "sourceFileId" not in body[0]
        assert "contentRevision" not in body[0]
        assert "enabled" not in body[0]
        assert body[0]["type"] == "notice"
        assert "copies" in body[0]
        assert "title" not in body[0]["copies"]["en"]
        assert "<p>" in body[0]["copies"]["en"]["body"]
        assert "Hello" in body[0]["copies"]["en"]["body"]

        listed = client.get("/api/v1/admin/popups")
        assert listed.status_code == 200
        assert len(listed.json()) == 1
        assert listed.json()[0]["name"] == "Test notice"

        deleted = client.delete(f"/api/v1/admin/popups/{popup_id}")
        assert deleted.status_code == 204
        assert client.get("/api/v1/popups").json() == []
    finally:
        app.dependency_overrides.clear()


def test_to_published_response_shape(isolated_data):
    created = create_popup(_notice_payload())
    public = to_published_response(created)
    assert set(public.keys()) == {
        "id",
        "type",
        "sortOrder",
        "imageId",
        "backgroundColor",
        "copies",
    }


def test_poster_with_real_image(isolated_data):
    image_id = _make_image_id()
    created = create_popup(
        {
            "name": "Poster",
            "type": "poster",
            "imageId": image_id,
            "copies": {},
        }
    )
    assert created["type"] == "poster"
    assert created["imageId"] == image_id
