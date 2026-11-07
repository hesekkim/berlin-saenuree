import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services.blogger_service import create_blogger, delete_blogger
from services.blogger_trash_service import list_trash, purge_expired_trash


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "blogger_trash_retention_days", 30)
    return tmp_path


def _blogger_trash_item(deleted_at: datetime) -> dict:
    item = {
        "id": str(uuid.uuid4()),
        "deletedAt": deleted_at.isoformat(),
        "deletedBy": "admin@example.com",
        "blogger": {
            "id": str(uuid.uuid4()),
            "enabled": True,
            "createdBy": "admin@example.com",
            "createdAt": deleted_at.isoformat(),
            "updatedAt": deleted_at.isoformat(),
            "contentRevision": 1,
            "copies": {"ko": {"title": "제목", "body": "<p>본문</p>"}},
        },
    }
    settings.blogger_trash_file.write_text(
        json.dumps({"items": [item]}),
        encoding="utf-8",
    )
    return item


def test_purge_expired_trash_removes_expired_items(isolated_data):
    expired = _blogger_trash_item(
        datetime.now(timezone.utc) - timedelta(days=31),
    )

    purge_expired_trash()

    assert list_trash(role="site_admin", email="admin@example.com") == {
        "items": [],
        "total": 0,
    }
    assert expired["id"] not in settings.blogger_trash_file.read_text(
        encoding="utf-8",
    )


def test_purge_expired_trash_keeps_items_within_retention(isolated_data):
    current = _blogger_trash_item(datetime.now(timezone.utc))

    purge_expired_trash()

    response = list_trash(role="site_admin", email="admin@example.com")
    assert response["total"] == 1
    assert response["items"][0]["id"] == current["id"]
    assert response["items"][0]["expiresAt"]


def test_blogger_trash_routes_enforce_visibility_and_lifecycle(isolated_data):
    client = TestClient(app)

    def manager(email: str = "manager@example.com"):
        return {
            "email": email,
            "name": "Manager",
            "role": "page_manager",
            "pages": ["blogger"],
            "effectivePages": ["blogger"],
            "adminLanguage": "en",
        }

    app.dependency_overrides[get_current_cms_user] = manager
    try:
        created = create_blogger(
            {
                "enabled": True,
                "copies": {"ko": {"title": "제목", "body": "<p>본문</p>"}},
            },
            created_by="manager@example.com",
            role="page_manager",
        )
        delete_blogger(
            created["id"],
            role="page_manager",
            email="manager@example.com",
        )

        listed = client.get("/api/v1/admin/blogger/trash")
        assert listed.status_code == 200
        trash_id = listed.json()["items"][0]["id"]

        app.dependency_overrides[get_current_cms_user] = lambda: manager(
            "other@example.com"
        )
        forbidden = client.post(
            f"/api/v1/admin/blogger/trash/{trash_id}/restore",
        )
        assert forbidden.status_code == 403

        app.dependency_overrides[get_current_cms_user] = manager
        restored = client.post(
            f"/api/v1/admin/blogger/trash/{trash_id}/restore",
        )
        assert restored.status_code == 200
        assert restored.json()["id"] == created["id"]

        delete_blogger(
            created["id"],
            role="page_manager",
            email="manager@example.com",
        )
        listed_again = client.get("/api/v1/admin/blogger/trash")
        second_trash_id = listed_again.json()["items"][0]["id"]
        purged = client.delete(
            f"/api/v1/admin/blogger/trash/{second_trash_id}",
        )
        assert purged.status_code == 204
    finally:
        app.dependency_overrides.clear()