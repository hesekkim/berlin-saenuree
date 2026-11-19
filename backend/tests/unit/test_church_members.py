from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from models.cms import ChurchMemberCreateRequest
from services.backups_service import _iter_data_files
from services.church_members_service import (
    create_church_member,
    list_church_members,
)


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    return tmp_path


def _user(role: str, pages: list[str] | None = None) -> dict:
    assigned_pages = pages or []
    return {
        "email": f"{role}@example.com",
        "name": role,
        "role": role,
        "pages": assigned_pages,
        "effectivePages": assigned_pages,
        "adminLanguage": "en",
        "darkMode": None,
    }


def _client_as(role: str, pages: list[str] | None = None) -> TestClient:
    app.dependency_overrides[get_current_cms_user] = lambda: _user(role, pages)
    return TestClient(app)


def test_member_directory_is_private_and_role_gated(isolated_data):
    manager = _client_as("page_manager", ["members"])
    try:
        assert manager.get("/api/v1/admin/members").status_code == 200
        denied = manager.post(
            "/api/v1/admin/members",
            json={"name": "Member", "birthDate": "1990-04-12"},
        )
        assert denied.status_code == 403
        member = create_church_member(
            ChurchMemberCreateRequest(name="Member", birthDate="1990-04-12")
        )
        denied_update = manager.put(
            f"/api/v1/admin/members/{member['id']}",
            json={"name": "Changed", "birthDate": "1991-04-12"},
        )
        assert denied_update.status_code == 403
        denied_delete = manager.delete(
            f"/api/v1/admin/members/{member['id']}"
        )
        assert denied_delete.status_code == 403
        assert len(list_church_members()) == 1
    finally:
        app.dependency_overrides.clear()

    anonymous = TestClient(app).get("/api/v1/admin/members")
    assert anonymous.status_code == 401


@pytest.mark.parametrize("role", ["page_admin", "page_manager"])
def test_cms_user_without_member_page_assignment_is_denied(isolated_data, role):
    client = _client_as(role)
    try:
        assert client.get("/api/v1/admin/members").status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["site_admin", "page_admin"])
def test_authorized_admins_can_create_and_delete_member(isolated_data, role):
    client = _client_as(role, ["members"] if role == "page_admin" else [])
    try:
        created = client.post(
            "/api/v1/admin/members",
            json={
                "name": "  Alex Kim  ",
                "birthDate": "1990-04-12",
                "email": "  ALEX@example.com ",
            },
        )
        assert created.status_code == 201
        member = created.json()
        assert member["name"] == "Alex Kim"
        assert member["email"] == "alex@example.com"
        assert member["phone"] is None

        updated_response = client.put(
            f"/api/v1/admin/members/{member['id']}",
            json={
                "name": "Alex Kim Updated",
                "birthDate": "1991-04-12",
                "email": "new@example.com",
                "phone": "+49 30 1234567",
            },
        )
        assert updated_response.status_code == 200
        updated = updated_response.json()
        assert updated["id"] == member["id"]
        assert updated["name"] == "Alex Kim Updated"
        assert client.get("/api/v1/admin/members").json() == [updated]

        deleted = client.delete(f"/api/v1/admin/members/{member['id']}")
        assert deleted.status_code == 204
        assert client.get("/api/v1/admin/members").json() == []
        not_found = client.put(
            f"/api/v1/admin/members/{member['id']}",
            json={"name": "Missing", "birthDate": "1990-04-12"},
        )
        assert not_found.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_name_and_birth_date_are_required_but_contact_fields_are_optional(
    isolated_data,
):
    client = _client_as("page_admin", ["members"])
    try:
        accepted = client.post(
            "/api/v1/admin/members",
            json={"name": "Member", "birthDate": "1980-01-03"},
        )
        assert accepted.status_code == 201
        assert accepted.json()["email"] is None
        assert accepted.json()["phone"] is None

        missing_birth_date = client.post(
            "/api/v1/admin/members",
            json={"name": "Member"},
        )
        assert missing_birth_date.status_code == 422
        invalid_email = client.post(
            "/api/v1/admin/members",
            json={
                "name": "Member",
                "birthDate": "1980-01-03",
                "email": "not-an-email",
            },
        )
        assert invalid_email.status_code == 422
        invalid_phone = client.post(
            "/api/v1/admin/members",
            json={
                "name": "Member",
                "birthDate": "1980-01-03",
                "phone": "Call me",
            },
        )
        assert invalid_phone.status_code == 422
        valid_phone = client.post(
            "/api/v1/admin/members",
            json={
                "name": "Member",
                "birthDate": "1980-01-03",
                "phone": "+49 (30) 123-4567",
            },
        )
        assert valid_phone.status_code == 201
        assert valid_phone.json()["phone"] == "+49 (30) 123-4567"
    finally:
        app.dependency_overrides.clear()


def test_future_birth_dates_are_rejected():
    with pytest.raises(ValueError, match="future"):
        ChurchMemberCreateRequest(
            name="Member",
            birthDate=date.today() + timedelta(days=1),
        )


def test_member_data_is_included_in_backup_data_files(isolated_data):
    client = _client_as("page_admin", ["members"])
    try:
        response = client.post(
            "/api/v1/admin/members",
            json={"name": "Member", "birthDate": "1980-01-03"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert settings.church_members_file.is_file()
    assert settings.church_members_file in _iter_data_files()
    assert list_church_members()[0]["name"] == "Member"
