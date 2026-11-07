from fastapi.testclient import TestClient
import pytest

from api.v1.endpoints.auth import get_current_cms_user
from main import app
from services.blogger_draft_service import (
    delete_draft_for_user,
    delete_drafts_for_source,
    delete_draft_for_source,
    get_draft_for_user,
    get_draft_for_source,
    list_drafts_for_user,
    list_draft_media_ids,
    upsert_draft_for_user,
    upsert_draft_for_source,
)
from services.blogger_service import BloggerConflictError, create_blogger
from services.posts_service import active_media_refs


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr("core.config.settings.data_root", str(tmp_path))
    monkeypatch.setattr("core.config.settings.admin_emails", ["admin@example.com"])
    return tmp_path


def _site_admin():
    return {
        "email": "admin@example.com",
        "name": None,
        "role": "site_admin",
        "pages": ["home", "blogger"],
        "effectivePages": ["home", "blogger"],
        "adminLanguage": "en",
    }


def _page_manager(email: str = "manager@example.com"):
    return {
        "email": email,
        "name": "Manager",
        "role": "page_manager",
        "pages": ["blogger"],
        "effectivePages": ["blogger"],
        "adminLanguage": "en",
    }


def test_blogger_draft_upsert_keeps_one_per_account(isolated_data):
    first = upsert_draft_for_user(
        {
            "enabled": True,
            "copies": {"en": {"title": "Draft", "body": "<p>Hello</p>"}},
        },
        email="manager@example.com",
    )
    assert first["contentRevision"] == 1
    assert "ko" not in first["copies"]

    second = upsert_draft_for_user(
        {
                "published": False,
            "contentRevision": 1,
            "copies": {
                "ko": {"title": "초안", "body": "<p>본문</p>"},
                "en": {"title": "Draft", "body": "<p>Updated</p>"},
            },
        },
        email="manager@example.com",
    )
    assert second["id"] == first["id"]
    assert second["contentRevision"] == 2
    assert second["published"] is False
    assert second["copies"]["ko"]["title"] == "초안"

    loaded = get_draft_for_user("manager@example.com")
    assert loaded["contentRevision"] == 2


def test_blogger_draft_conflict_and_delete(isolated_data):
    created = upsert_draft_for_user(
        {"copies": {"ko": {"title": "A", "body": "<p>a</p>"}}},
        email="manager@example.com",
    )
    with pytest.raises(BloggerConflictError) as raised:
        upsert_draft_for_user(
            {
                "contentRevision": 0,
                "copies": {"ko": {"title": "B", "body": "<p>b</p>"}},
            },
            email="manager@example.com",
        )
    assert raised.value.item["id"] == created["id"]

    delete_draft_for_user("manager@example.com")
    assert get_draft_for_user("manager@example.com") is None


def test_blogger_drafts_are_isolated_by_source_blogger(isolated_data):
    new_post_draft = upsert_draft_for_user(
        {"copies": {"ko": {"title": "새 글", "body": "<p>본문</p>"}}},
        email="manager@example.com",
    )
    first_edit_draft = upsert_draft_for_source(
        {"copies": {"ko": {"title": "수정 1", "body": "<p>본문</p>"}}},
        email="manager@example.com",
        source_blogger_id="blogger-1",
        source_content_revision=3,
    )
    second_edit_draft = upsert_draft_for_source(
        {"copies": {"ko": {"title": "수정 2", "body": "<p>본문</p>"}}},
        email="manager@example.com",
        source_blogger_id="blogger-2",
        source_content_revision=5,
    )

    assert get_draft_for_user("manager@example.com")["id"] == new_post_draft["id"]
    assert get_draft_for_source(
        "manager@example.com", source_blogger_id="blogger-1"
    )["id"] == first_edit_draft["id"]
    assert second_edit_draft["sourceContentRevision"] == 5
    assert len(list_drafts_for_user("manager@example.com")) == 3

    delete_draft_for_source("manager@example.com", source_blogger_id="blogger-1")
    assert get_draft_for_source(
        "manager@example.com", source_blogger_id="blogger-1"
    ) is None
    assert get_draft_for_user("manager@example.com")["id"] == new_post_draft["id"]


def test_delete_drafts_for_source_removes_all_editors_and_media(
    isolated_data, monkeypatch
):
    source_id = "blogger-1"
    media_id = "12345678-1234-1234-1234-123456789abc"
    upsert_draft_for_source(
        {
            "copies": {
                "ko": {
                    "title": "수정",
                    "body": (
                        f'<p><img data-media-id="{media_id}" '
                        f'src="/api/v1/media/files/{media_id}"></p>'
                    ),
                }
            }
        },
        email="one@example.com",
        source_blogger_id=source_id,
        source_content_revision=1,
    )
    upsert_draft_for_source(
        {"copies": {"ko": {"title": "수정", "body": "<p>본문</p>"}}},
        email="two@example.com",
        source_blogger_id=source_id,
        source_content_revision=1,
    )

    cleanup = lambda **kwargs: cleanup.calls.append(kwargs)
    cleanup.calls = []
    monkeypatch.setattr("services.posts_service._cleanup_unused_media", cleanup)

    delete_drafts_for_source(source_id)

    assert list_drafts_for_user("one@example.com") == []
    assert list_drafts_for_user("two@example.com") == []
    assert cleanup.calls == [{"image_ids": set(), "file_ids": {media_id}}]


def test_blogger_draft_sanitizes_and_collects_media_ids(isolated_data):
    media_id = "12345678-1234-1234-1234-123456789abc"
    upsert_draft_for_user(
        {
            "copies": {
                "ko": {
                    "title": "사진",
                    "body": (
                        f'<p><img data-media-id="{media_id}" '
                        f'src="/api/v1/media/files/{media_id}"></p>'
                        "<script>alert(1)</script>"
                    ),
                }
            }
        },
        email="admin@example.com",
    )
    draft = get_draft_for_user("admin@example.com")
    assert "<script>" not in draft["copies"]["ko"]["body"]
    assert media_id in draft["copies"]["ko"]["body"]
    assert list_draft_media_ids() == (media_id,)


def test_blogger_draft_media_is_protected_and_cleaned_on_delete(
    isolated_data, monkeypatch
):
    media_id = "12345678-1234-1234-1234-123456789abc"
    image_id = "aaaaaaaa-1234-1234-1234-123456789abc"
    upsert_draft_for_user(
        {
            "copies": {
                "ko": {
                    "title": "사진",
                    "body": (
                        f'<p><img data-media-id="{media_id}" '
                        f'data-image-id="{image_id}" '
                        f'src="/api/v1/media/images/{image_id}/display"></p>'
                    ),
                }
            }
        },
        email="manager@example.com",
    )
    assert media_id in active_media_refs()
    assert image_id in active_media_refs()

    cleanup = lambda **kwargs: cleanup.calls.append(kwargs)
    cleanup.calls = []
    monkeypatch.setattr("services.posts_service._cleanup_unused_media", cleanup)

    delete_draft_for_user("manager@example.com")

    assert active_media_refs() == set()
    assert cleanup.calls == [
        {"image_ids": {image_id}, "file_ids": {media_id}},
    ]


def test_blogger_draft_upsert_cleans_up_media_removed_on_save(
    isolated_data, monkeypatch
):
    media_id = "12345678-1234-1234-1234-123456789abc"
    image_id = "aaaaaaaa-1234-1234-1234-123456789abc"
    first = upsert_draft_for_user(
        {
            "copies": {
                "ko": {
                    "title": "사진",
                    "body": (
                        f'<p><img data-media-id="{media_id}" '
                        f'data-image-id="{image_id}" '
                        f'src="/api/v1/media/images/{image_id}/display"></p>'
                    ),
                }
            }
        },
        email="manager@example.com",
    )
    assert media_id in active_media_refs()
    assert image_id in active_media_refs()

    cleanup = lambda **kwargs: cleanup.calls.append(kwargs)
    cleanup.calls = []
    monkeypatch.setattr("services.posts_service._cleanup_unused_media", cleanup)

    upsert_draft_for_user(
        {
            "contentRevision": first["contentRevision"],
            "copies": {"ko": {"title": "사진", "body": "<p>본문만 남음</p>"}},
        },
        email="manager@example.com",
    )

    assert cleanup.calls == [
        {"image_ids": {image_id}, "file_ids": {media_id}},
    ]


def test_blogger_draft_api_me_endpoints(isolated_data):
    app.dependency_overrides[get_current_cms_user] = _page_manager
    client = TestClient(app)

    missing = client.get("/api/v1/admin/blogger/drafts/me")
    assert missing.status_code == 200
    assert missing.json() is None

    created = client.put(
        "/api/v1/admin/blogger/drafts/me",
        json={
            "enabled": True,
            "copies": {"ko": {"title": "초안", "body": "<p>hi</p>"}},
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["createdBy"] == "manager@example.com"
    assert body["contentRevision"] == 1

    updated = client.put(
        "/api/v1/admin/blogger/drafts/me",
        json={
            "enabled": True,
            "contentRevision": 1,
            "copies": {"ko": {"title": "초안2", "body": "<p>hi2</p>"}},
        },
    )
    assert updated.status_code == 200
    assert updated.json()["contentRevision"] == 2

    conflict = client.put(
        "/api/v1/admin/blogger/drafts/me",
        json={
            "enabled": True,
            "contentRevision": 1,
            "copies": {"ko": {"title": "stale", "body": "<p>x</p>"}},
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["contentRevision"] == 2

    deleted = client.delete("/api/v1/admin/blogger/drafts/me")
    assert deleted.status_code == 204
    after_delete = client.get("/api/v1/admin/blogger/drafts/me")
    assert after_delete.status_code == 200
    assert after_delete.json() is None

    # Idempotent delete when already gone
    assert client.delete("/api/v1/admin/blogger/drafts/me").status_code == 204

    app.dependency_overrides.clear()


def test_blogger_draft_api_requires_page_access(isolated_data):
    def outsider():
        return {
            "email": "out@example.com",
            "name": "Out",
            "role": "page_manager",
            "pages": ["home"],
            "effectivePages": ["home"],
            "adminLanguage": "en",
        }

    app.dependency_overrides[get_current_cms_user] = outsider
    client = TestClient(app)
    assert client.get("/api/v1/admin/blogger/drafts/me").status_code == 403
    app.dependency_overrides.clear()


def test_blogger_edit_draft_api_is_per_document_and_requires_mutation_access(
    isolated_data,
):
    created = create_blogger(
        {"copies": {"ko": {"title": "원본", "body": "<p>본문</p>"}}},
        created_by="manager@example.com",
        role="page_manager",
    )
    app.dependency_overrides[get_current_cms_user] = _page_manager
    client = TestClient(app)

    saved = client.put(
        f"/api/v1/admin/blogger/{created['id']}/drafts/me",
        json={"copies": {"ko": {"title": "수정", "body": "<p>초안</p>"}}},
    )
    assert saved.status_code == 200
    assert saved.json()["sourceBloggerId"] == created["id"]
    assert saved.json()["sourceContentRevision"] == created["contentRevision"]

    drafts = client.get("/api/v1/admin/blogger/drafts")
    assert drafts.status_code == 200
    assert [draft["id"] for draft in drafts.json()] == [saved.json()["id"]]

    app.dependency_overrides[get_current_cms_user] = lambda: _page_manager(
        "other@example.com"
    )
    denied = client.get(f"/api/v1/admin/blogger/{created['id']}/drafts/me")
    assert denied.status_code == 403
    app.dependency_overrides.clear()
