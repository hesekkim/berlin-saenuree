from datetime import date
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from api.v1.endpoints.auth import get_current_cms_user
from main import app
from services.blogger_service import (
    BloggerConflictError,
    BloggerPermissionError,
    BloggerValidationError,
    can_mutate_blogger,
    create_blogger,
    list_blogger,
    resolve_blogger_copy,
    update_blogger,
)
from services.blogger_trash_service import list_trash, purge_trash_item, restore_trash_item
from services.media_files_service import save_file


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


def _page_admin():
    return {
        "email": "page@example.com",
        "name": "Page",
        "role": "page_admin",
        "pages": ["blogger"],
        "effectivePages": ["blogger"],
        "adminLanguage": "en",
    }


def _payload(**overrides):
    payload = {
        "enabled": True,
        "copies": {
            "ko": {"title": "안녕", "body": "<p>첫 글</p>"},
            "en": {"title": "Hello", "body": "<p>First post</p>"},
        },
    }
    payload.update(overrides)
    return payload


def _png_bytes(width: int = 1000, height: int = 500) -> bytes:
    image = Image.new("RGB", (width, height), color=(20, 120, 200))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_blogger_publish_replaces_image_reference_for_all_languages(isolated_data):
    source = save_file(
        _png_bytes(),
        original_name="photo.png",
        content_type="image/png",
    )
    body = (
        f'<p><img data-media-id="{source["id"]}" data-media-width="600" '
        f'src="/api/v1/media/files/{source["id"]}"></p>'
    )

    created = create_blogger(
        _payload(
            copies={
                "ko": {"title": "사진", "body": body},
                "en": {"title": "Photo", "body": body},
            }
        ),
        created_by="admin@example.com",
        role="site_admin",
    )

    published_body = created["copies"]["ko"]["body"]
    assert f'data-media-id="{source["id"]}"' in published_body
    assert 'data-media-width="600"' in published_body
    assert '/api/v1/media/images/' in published_body
    image_id = published_body.split('data-image-id="', 1)[1].split('"', 1)[0]
    assert image_id in created["copies"]["en"]["body"]
    assert Image.open(
        isolated_data / "data" / "media" / "images" / image_id / "display.webp"
    ).size == (600, 300)


def test_blogger_publish_width_change_removes_unreferenced_old_derivative(isolated_data):
    source = save_file(
        _png_bytes(),
        original_name="photo.png",
        content_type="image/png",
    )
    body = (
        f'<p><img data-media-id="{source["id"]}" data-media-width="600" '
        f'src="/api/v1/media/files/{source["id"]}"></p>'
    )
    created = create_blogger(
        _payload(copies={"ko": {"title": "사진", "body": body}}),
        created_by="admin@example.com",
        role="site_admin",
    )
    old_image_id = created["copies"]["ko"]["body"].split(
        'data-image-id="', 1
    )[1].split('"', 1)[0]

    updated = update_blogger(
        created["id"],
        {
            "contentRevision": created["contentRevision"],
            "copies": {
                "ko": {
                    "title": "사진",
                    "body": body.replace('data-media-width="600"', 'data-media-width="400"'),
                }
            },
        },
        role="site_admin",
    )
    new_image_id = updated["copies"]["ko"]["body"].split(
        'data-image-id="', 1
    )[1].split('"', 1)[0]

    assert new_image_id != old_image_id
    assert not (isolated_data / "data" / "media" / "images" / old_image_id).exists()
    assert (isolated_data / "data" / "media" / "images" / new_image_id).exists()


def test_blogger_publish_defaults_missing_image_width(isolated_data):
    source = save_file(
        _png_bytes(),
        original_name="photo.png",
        content_type="image/png",
    )
    body = (
        f'<p><img data-media-id="{source["id"]}" '
        f'src="/api/v1/media/files/{source["id"]}"></p>'
    )

    created = create_blogger(
        _payload(copies={"ko": {"title": "사진", "body": body}}),
        created_by="admin@example.com",
        role="site_admin",
    )

    published_body = created["copies"]["ko"]["body"]
    assert f'data-media-id="{source["id"]}"' in published_body
    assert "/api/v1/media/images/" in published_body
    image_id = published_body.split('data-image-id="', 1)[1].split('"', 1)[0]
    assert Image.open(
        isolated_data / "data" / "media" / "images" / image_id / "display.webp"
    ).size == (1000, 500)


def test_blogger_create_rejects_body_without_text_or_media(isolated_data):
    with pytest.raises(BloggerValidationError, match="ko body"):
        create_blogger(
            _payload(copies={"ko": {"title": "제목", "body": "<p><br></p>"}}),
            created_by="admin@example.com",
            role="site_admin",
        )


def test_blogger_create_requires_ko_copy_and_filtering(isolated_data):
    with pytest.raises(BloggerValidationError, match="ko.*title|ko.*body"):
        create_blogger(
            {"enabled": True, "copies": {"en": {"title": "Hello", "body": "<p>Hi</p>"}}},
            created_by="admin@example.com",
            role="site_admin",
        )

    created = create_blogger(
        _payload(),
        created_by="admin@example.com",
        role="site_admin",
    )
    assert created["published"] is True

    page = list_blogger(
        limit=10,
        offset=0,
        query="first",
        created_by="admin@example.com",
            published=True,
    )
    assert page["total"] == 1
    assert page["items"][0]["id"] == created["id"]
    assert can_mutate_blogger("site_admin", "anyone@example.com", created)
    assert can_mutate_blogger("page_manager", "manager@example.com", created) is False


def test_blogger_create_sanitizes_rich_html_and_filters_by_date(isolated_data):
    created = create_blogger(
        _payload(
            copies={
                "ko": {
                    "title": "안전한 글",
                    "body": "<script>alert(1)</script><p>본문</p>",
                }
            }
        ),
        created_by="admin@example.com",
        role="site_admin",
    )

    assert "<script>" not in created["copies"]["ko"]["body"]
    assert "본문" in created["copies"]["ko"]["body"]
    assert list_blogger(from_date=date.today(), to_date=date.today())["total"] == 1


def test_blogger_resolve_copy_uses_current_then_default_then_en():
    copies = {
        "ko": {"title": "한국어", "body": "<p>한국어 본문</p>"},
        "en": {"title": "English", "body": "<p>English body</p>"},
    }
    assert resolve_blogger_copy(copies, "en", "ko") == copies["en"]
    assert resolve_blogger_copy(copies, "de", "ko") == copies["ko"]
    assert resolve_blogger_copy(copies, "", "ko") == copies["ko"]
    assert resolve_blogger_copy(copies, "de", "fr") == copies["en"]
    assert resolve_blogger_copy({"ko": {"title": "만", "body": "<p>본문</p>"}}, "de", "fr") == {
        "title": "만",
        "body": "<p>본문</p>",
    }


def test_blogger_update_conflict_and_manager_permissions(isolated_data):
    created = create_blogger(
        _payload(),
        created_by="manager@example.com",
        role="page_manager",
    )

    updated = update_blogger(
        created["id"],
        {
            **_payload(
                copies={
                    "ko": {"title": "수정 제목", "body": "<p>새 본문</p>"},
                    "en": {"title": "Updated", "body": "<p>new body</p>"},
                }
            ),
            "contentRevision": 1,
        },
        role="page_manager",
    )
    assert updated["contentRevision"] == 2
    assert "새 본문" in updated["copies"]["ko"]["body"]

    with pytest.raises(BloggerConflictError) as exc:
        update_blogger(
            created["id"],
            {
                **_payload(copies={"ko": {"title": "낡은 제목", "body": "<p>stale</p>"}}),
                "contentRevision": 1,
            },
            role="page_manager",
        )
    assert exc.value.item["contentRevision"] == 2

    with pytest.raises(BloggerPermissionError):
        update_blogger(
            created["id"],
            {
                **_payload(copies={"ko": {"title": "다른 사람", "body": "<p>blocked</p>"}}),
                "contentRevision": 2,
            },
            role="page_manager",
            created_by="other@example.com",
        )


def test_blogger_update_cleans_up_media_removed_on_save(isolated_data, monkeypatch):
    source = save_file(
        _png_bytes(),
        original_name="photo.png",
        content_type="image/png",
    )
    media_id = source["id"]
    created = create_blogger(
        _payload(
            copies={
                "ko": {
                    "title": "사진",
                    "body": (
                        f'<p><img data-media-id="{media_id}" '
                        'data-media-width="600" '
                        f'src="/api/v1/media/files/{media_id}"></p>'
                    ),
                }
            }
        ),
        created_by="admin@example.com",
        role="site_admin",
    )
    image_id = created["copies"]["ko"]["body"].split(
        'data-image-id="', 1
    )[1].split('"', 1)[0]

    cleanup = lambda **kwargs: cleanup.calls.append(kwargs)
    cleanup.calls = []
    monkeypatch.setattr("services.posts_service._cleanup_unused_media", cleanup)

    update_blogger(
        created["id"],
        {
            "contentRevision": created["contentRevision"],
            "copies": {"ko": {"title": "사진", "body": "<p>본문만 남음</p>"}},
        },
        role="site_admin",
    )

    assert cleanup.calls == [
        {"image_ids": {image_id}, "file_ids": {media_id}},
    ]


def test_blogger_admin_api_requires_page_access_and_conflict_response(isolated_data):
    client = TestClient(app)

    def override_no_access():
        return {
            "email": "other@example.com",
            "name": "Other",
            "role": "page_admin",
            "pages": ["home"],
            "effectivePages": ["home"],
            "adminLanguage": "en",
        }

    def override_manager():
        return _page_manager("manager@example.com")

    def override_other_manager():
        return _page_manager("other@example.com")

    app.dependency_overrides[get_current_cms_user] = override_no_access
    denied = client.get("/api/v1/admin/blogger")
    assert denied.status_code == 403

    app.dependency_overrides[get_current_cms_user] = override_manager
    invalid = client.post(
        "/api/v1/admin/blogger",
        json={
            "enabled": True,
            "copies": {"en": {"title": "No", "body": "<p>ko 없음</p>"}},
        },
    )
    assert invalid.status_code == 400

    created = client.post(
        "/api/v1/admin/blogger",
        json={
            "enabled": True,
            "copies": {
                "ko": {"title": "나의 글", "body": "<p>hello</p>"},
                "en": {"title": "Mine", "body": "<p>hello</p>"},
            },
        },
    )
    assert created.status_code == 201
    item_id = created.json()["id"]

    app.dependency_overrides[get_current_cms_user] = override_other_manager
    forbidden = client.put(
        f"/api/v1/admin/blogger/{item_id}",
        json={
            "enabled": True,
            "contentRevision": 1,
            "copies": {
                "ko": {"title": "침입", "body": "<p>not allowed</p>"},
            },
        },
    )
    assert forbidden.status_code == 403

    app.dependency_overrides[get_current_cms_user] = override_manager
    valid_update = client.put(
        f"/api/v1/admin/blogger/{item_id}",
        json={
            "enabled": True,
            "contentRevision": 1,
            "copies": {
                "ko": {"title": "업데이트", "body": "<p>fresh</p>"},
                "en": {"title": "Fresh", "body": "<p>fresh</p>"},
            },
        },
    )
    assert valid_update.status_code == 200

    stale = client.put(
        f"/api/v1/admin/blogger/{item_id}",
        json={
            "enabled": True,
            "contentRevision": 1,
            "copies": {
                "ko": {"title": "달라짐", "body": "<p>stale</p>"},
            },
        },
    )
    assert stale.status_code == 409
    assert stale.json()["contentRevision"] == 2
    app.dependency_overrides.clear()


def test_blogger_trash_lifecycle_and_manager_visibility(isolated_data):
    source = save_file(
        _png_bytes(),
        original_name="photo.png",
        content_type="image/png",
    )
    media_id = source["id"]
    created = create_blogger(
        _payload(
            copies={
                "ko": {
                    "title": "사진",
                    "body": (
                        f'<p><img data-media-id="{media_id}" '
                        'data-media-width="600" '
                        f'src="/api/v1/media/files/{media_id}"></p>'
                    ),
                }
            }
        ),
        created_by="manager@example.com",
        role="page_manager",
    )
    from services.blogger_service import delete_blogger

    delete_blogger(created["id"], role="page_manager", email="manager@example.com")
    assert list_blogger()["total"] == 0
    visible = list_trash(role="page_manager", email="manager@example.com")
    assert visible["total"] == 1
    assert media_id in visible["items"][0]["blogger"]["copies"]["ko"]["body"]
    assert list_trash(role="page_manager", email="other@example.com")["total"] == 0
    restored = restore_trash_item(visible["items"][0]["id"], role="page_manager", email="manager@example.com")
    assert restored["id"] == created["id"]
    assert restored["contentRevision"] == 2


def test_blogger_trash_restore_conflict_and_purge_media_reference(isolated_data, monkeypatch):
    first = create_blogger(_payload(), created_by="admin@example.com", role="site_admin")
    second = create_blogger(_payload(), created_by="admin@example.com", role="site_admin")
    from services.blogger_service import delete_blogger

    delete_blogger(first["id"], role="site_admin", email="admin@example.com")
    delete_blogger(second["id"], role="site_admin", email="admin@example.com")
    items = list_trash(role="site_admin", email="admin@example.com")["items"]
    monkeypatch.setattr("services.blogger_trash_service._cleanup_media", lambda media: None)
    from services.blogger_service import _save_store

    _save_store({"bloggers": [first]})
    first_trash = next(item for item in items if item["blogger"]["id"] == first["id"])
    second_trash = next(item for item in items if item["blogger"]["id"] == second["id"])
    with pytest.raises(BloggerConflictError):
        restore_trash_item(first_trash["id"], role="site_admin", email="admin@example.com")
    purge_trash_item(second_trash["id"], role="site_admin", email="admin@example.com")
