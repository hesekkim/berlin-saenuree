"""Tests for post trash retention and scheduled cleanup."""

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from core.config import settings
from services.posts_trash_service import (
    list_trash,
    purge_expired_trash,
)


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "posts_trash_retention_days", 30)
    return tmp_path


def _write_trash_item(deleted_at: datetime) -> dict:
    item = {
        "id": str(uuid.uuid4()),
        "deletedAt": deleted_at.isoformat(),
        "deletedBy": "admin@example.com",
        "post": {
            "id": str(uuid.uuid4()),
            "createdBy": "admin@example.com",
            "images": [],
            "copies": {},
        },
    }
    settings.posts_trash_file.write_text(
        json.dumps({"items": [item]}),
        encoding="utf-8",
    )
    return item


def test_purge_expired_trash_removes_items_after_retention(isolated_data):
    trash_item = _write_trash_item(
        datetime.now(timezone.utc) - timedelta(days=31),
    )
    store_path = settings.posts_trash_file

    purge_expired_trash()

    assert list_trash(role="site_admin", email="admin@example.com") == {
        "items": [],
        "total": 0,
    }
    assert trash_item["id"] not in store_path.read_text(encoding="utf-8")


def test_purge_expired_trash_keeps_items_within_retention(isolated_data):
    trash_item = _write_trash_item(datetime.now(timezone.utc))

    purge_expired_trash()

    response = list_trash(role="site_admin", email="admin@example.com")
    assert response["total"] == 1
    assert response["items"][0]["id"] == trash_item["id"]
    assert response["items"][0]["expiresAt"]
