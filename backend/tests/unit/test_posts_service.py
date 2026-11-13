"""posts_service (ticket 030)."""

from io import BytesIO
from datetime import date
from pathlib import Path

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services import posts_service
from services.image_optimize_service import optimize_image_bytes
from services.media_files_service import save_file
from services.posts_service import (
    MAX_POST_IMAGE_BYTES,
    MAX_POST_IMAGES,
    PostsConflictError,
    PostsNotFoundError,
    PostsValidationError,
    active_media_refs,
    can_mutate_post,
    can_pin_post,
    create_post,
    delete_post,
    filter_posts,
    get_post,
    list_posts,
    remove_language_from_all_posts,
    update_post,
)
from services.posts_trash_service import (
    list_trash,
    move_to_trash,
    purge_trash_item,
    restore_trash_item,
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
        "pages": ["home", "posts"],
        "effectivePages": ["home", "posts"],
        "adminLanguage": "en",
    }


def _page_admin():
    return {
        "email": "page@example.com",
        "name": "Page",
        "role": "page_admin",
        "pages": ["posts"],
        "effectivePages": ["posts"],
        "adminLanguage": "en",
    }


def _page_manager(email: str = "manager@example.com"):
    return {
        "email": email,
        "name": "Manager",
        "role": "page_manager",
        "pages": ["posts"],
        "effectivePages": ["posts"],
        "adminLanguage": "en",
    }


def _no_posts_access():
    return {
        "email": "other@example.com",
        "name": "Other",
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


def _make_image() -> dict:
    content = _png_bytes()
    stored = save_file(
        content,
        original_name="shot.png",
        content_type="image/png",
    )
    optimized = optimize_image_bytes(
        content,
        content_type="image/png",
        source_file_id=stored["id"],
    )
    return {
        "imageId": optimized["imageId"],
        "sourceFileId": stored["id"],
        "width": optimized["width"],
        "height": optimized["height"],
    }


def _make_video(content: bytes = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00") -> dict:
    stored = save_file(
        content,
        original_name="clip.mp4",
        content_type="video/mp4",
    )
    return {
        "type": "video",
        "fileId": stored["id"],
        "width": 640,
        "height": 360,
    }


def _payload(**overrides):
    payload = {
        "published": True,
        "pinned": False,
        "images": [_make_image()],
        "copies": {"en": {"body": "<p>caption</p>"}},
    }
    payload.update(overrides)
    return payload


def test_can_mutate_and_pin_rules():
    post = {"createdBy": "manager@example.com"}
    assert can_mutate_post("site_admin", "anyone@example.com", post)
    assert can_mutate_post("page_admin", "anyone@example.com", post)
    assert can_mutate_post("page_manager", "manager@example.com", post)
    assert not can_mutate_post("page_manager", "other@example.com", post)
    assert can_pin_post("site_admin")
    assert can_pin_post("page_admin")
    assert not can_pin_post("page_manager")


def test_create_list_sort_and_pagination(isolated_data, monkeypatch):
    times = iter(
        [
            "2026-09-11T10:00:00+00:00",
            "2026-09-11T11:00:00+00:00",
            "2026-09-11T12:00:00+00:00",
        ]
    )
    monkeypatch.setattr(posts_service, "_utc_now_iso", lambda: next(times))

    older = create_post(
        _payload(pinned=False),
        created_by="admin@example.com",
        role="site_admin",
    )
    pinned = create_post(
        _payload(pinned=True, copies={"en": {"body": "<p>pin</p>"}}),
        created_by="admin@example.com",
        role="site_admin",
    )
    newer = create_post(
        _payload(copies={"en": {"body": "<p>new</p>"}}),
        created_by="admin@example.com",
        role="site_admin",
    )

    page = list_posts(limit=2, offset=0)
    assert page["total"] == 3
    assert page["limit"] == 2
    assert page["offset"] == 0
    assert [item["id"] for item in page["items"]] == [pinned["id"], newer["id"]]

    page2 = list_posts(limit=2, offset=2)
    assert [item["id"] for item in page2["items"]] == [older["id"]]

    clamped = list_posts(limit=999, offset=-5)
    assert clamped["limit"] == 100
    assert clamped["offset"] == 0


def test_filter_posts_matches_plain_caption_and_all_filters():
    items = [
        {
            "id": "first",
            "createdBy": "writer@example.com",
            "createdAt": "2026-09-10T12:00:00+00:00",
            "published": True,
            "pinned": True,
            "copies": {"en": {"body": "<p>Autumn exhibition</p>"}},
        },
        {
            "id": "second",
            "createdBy": "other@example.com",
            "createdAt": "2026-09-12T12:00:00+00:00",
            "published": False,
            "pinned": False,
            "copies": {"ko": {"body": "<p>Winter exhibition</p>"}},
        },
    ]

    result = filter_posts(
        items,
        query="AUTUMN",
        created_by="WRITER@EXAMPLE.COM",
        from_date=date(2026, 9, 10),
        to_date=date(2026, 9, 10),
        published=True,
        pinned=True,
    )

    assert [item["id"] for item in result] == ["first"]
    assert filter_posts(items, query="<p>") == []


def test_list_posts_total_is_filtered_before_pagination(isolated_data):
    first = create_post(
        _payload(copies={"en": {"body": "<p>matching</p>"}}),
        created_by="admin@example.com",
        role="site_admin",
    )
    create_post(
        _payload(copies={"en": {"body": "<p>other</p>"}}),
        created_by="admin@example.com",
        role="site_admin",
    )

    page = list_posts(query="matching", limit=1, offset=0)

    assert page["total"] == 1
    assert [item["id"] for item in page["items"]] == [first["id"]]


def test_images_count_validation(isolated_data):
    with pytest.raises(PostsValidationError):
        create_post(
            {"enabled": True, "images": [], "copies": {}},
            created_by="admin@example.com",
            role="site_admin",
        )

    too_many = [_make_image() for _ in range(MAX_POST_IMAGES + 1)]
    with pytest.raises(PostsValidationError):
        create_post(
            {"enabled": True, "images": too_many, "copies": {}},
            created_by="admin@example.com",
            role="site_admin",
        )


def test_image_source_size_validation(isolated_data, monkeypatch):
    image = _make_image()
    get_file_record = posts_service.get_file_record

    def oversized_file(file_id):
        record = get_file_record(file_id)
        if file_id == image["sourceFileId"]:
            record["meta"]["sizeBytes"] = MAX_POST_IMAGE_BYTES + 1
        return record

    monkeypatch.setattr(posts_service, "get_file_record", oversized_file)

    with pytest.raises(PostsValidationError, match="image exceeds maximum size"):
        create_post(
            {"published": True, "media": [image], "copies": {}},
            created_by="admin@example.com",
            role="site_admin",
        )


def test_image_source_at_size_limit_is_accepted(isolated_data, monkeypatch):
    image = _make_image()
    get_file_record = posts_service.get_file_record

    def maximum_size_file(file_id):
        record = get_file_record(file_id)
        if file_id == image["sourceFileId"]:
            record["meta"]["sizeBytes"] = MAX_POST_IMAGE_BYTES
        return record

    monkeypatch.setattr(posts_service, "get_file_record", maximum_size_file)

    created = create_post(
        {"published": True, "media": [image], "copies": {}},
        created_by="admin@example.com",
        role="site_admin",
    )

    assert created["media"] == [{"type": "image", **image}]


def test_video_media_validation_and_file_references(isolated_data, monkeypatch):
    video = _make_video()
    created = create_post(
        {"published": True, "media": [video], "copies": {}},
        created_by="admin@example.com",
        role="site_admin",
    )

    assert created["media"] == [video]
    assert video["fileId"] in active_media_refs()
    public = TestClient(app).get("/api/v1/posts").json()
    assert public["items"][0]["media"] == [video]

    with pytest.raises(PostsValidationError, match="one video"):
        create_post(
            {"published": True, "media": [video, _make_video()], "copies": {}},
            created_by="admin@example.com",
            role="site_admin",
        )

    monkeypatch.setattr(settings, "media_max_file_bytes", 8)
    with pytest.raises(PostsValidationError, match="maximum size"):
        create_post(
            {"published": True, "media": [video], "copies": {}},
            created_by="admin@example.com",
            role="site_admin",
        )


def test_video_posts_are_capped_at_200_mib_when_global_limit_is_higher(
    isolated_data, monkeypatch
):
    monkeypatch.setattr(settings, "media_max_file_bytes", 500 * 1024 * 1024)
    monkeypatch.setattr(
        posts_service,
        "get_file_record",
        lambda _file_id: {
            "meta": {
                "contentType": "video/mp4",
                "originalName": "clip.mp4",
                "sizeBytes": 200 * 1024 * 1024 + 1,
            }
        },
    )

    with pytest.raises(PostsValidationError, match="video exceeds maximum size"):
        create_post(
            {
                "published": True,
                "media": [
                    {
                        "type": "video",
                        "fileId": "video-file",
                        "width": 640,
                        "height": 360,
                    }
                ],
                "copies": {},
            },
            created_by="admin@example.com",
            role="site_admin",
        )


def test_empty_copies_allowed(isolated_data):
    created = create_post(
        {"published": True, "images": [_make_image()], "copies": {}},
        created_by="admin@example.com",
        role="site_admin",
    )
    assert created["copies"] == {}
    assert created["published"] is True


def test_sanitize_caption_html(isolated_data):
    created = create_post(
        _payload(
            copies={
                "en": {
                    "body": '<p>Safe</p><script>evil()</script>'
                    '<a href="https://example.com">ok</a>'
                }
            }
        ),
        created_by="admin@example.com",
        role="site_admin",
    )
    body = created["copies"]["en"]["body"]
    assert "<script" not in body.lower()
    assert "https://example.com" in body


def test_update_optimistic_lock(isolated_data):
    created = create_post(
        _payload(),
        created_by="admin@example.com",
        role="site_admin",
    )
    assert created["contentRevision"] == 1

    updated = update_post(
        created["id"],
        {
            **_payload(copies={"en": {"body": "<p>v2</p>"}}),
            "contentRevision": 1,
        },
        role="site_admin",
    )
    assert updated["contentRevision"] == 2
    assert "v2" in updated["copies"]["en"]["body"]

    with pytest.raises(PostsConflictError) as exc_info:
        update_post(
            created["id"],
            {
                **_payload(copies={"en": {"body": "<p>stale</p>"}}),
                "contentRevision": 1,
            },
            role="site_admin",
        )
    assert exc_info.value.post["contentRevision"] == 2


def test_create_and_update_ignore_pin_for_manager(isolated_data):
    created = create_post(
        _payload(pinned=True),
        created_by="manager@example.com",
        role="page_manager",
    )
    assert created["pinned"] is False
    updated = update_post(
        created["id"],
        {
            **_payload(pinned=True, copies={"en": {"body": "<p>x</p>"}}),
            "contentRevision": 1,
            "createdBy": "hacker@example.com",
            "createdAt": "2000-01-01T00:00:00+00:00",
        },
        role="page_manager",
    )
    assert updated["pinned"] is False
    assert updated["createdBy"] == "manager@example.com"
    assert updated["createdAt"] == created["createdAt"]


def test_page_admin_can_pin(isolated_data):
    created = create_post(
        _payload(pinned=False),
        created_by="page@example.com",
        role="page_admin",
    )
    updated = update_post(
        created["id"],
        {**_payload(pinned=True), "contentRevision": 1},
        role="page_admin",
    )
    assert updated["pinned"] is True


def test_language_cascade_keeps_post(isolated_data):
    created = create_post(
        _payload(
            copies={
                "en": {"body": "<p>en</p>"},
                "ko": {"body": "<p>ko</p>"},
            }
        ),
        created_by="admin@example.com",
        role="site_admin",
    )
    remove_language_from_all_posts("ko")
    post = get_post(created["id"])
    assert "ko" not in post["copies"]
    assert "en" in post["copies"]
    assert post["contentRevision"] == 2
    assert post["published"] is True


def test_media_gc_on_replace_and_delete(isolated_data):
    first = _make_image()
    second = _make_image()
    created = create_post(
        {"enabled": True, "images": [first], "copies": {}},
        created_by="admin@example.com",
        role="site_admin",
    )
    assert first["imageId"] in active_media_refs()
    assert first["sourceFileId"] in active_media_refs()

    update_post(
        created["id"],
        {
            "enabled": True,
            "images": [second],
            "copies": {},
            "contentRevision": 1,
        },
        role="site_admin",
    )
    assert first["imageId"] not in active_media_refs()
    assert not (settings.media_image_dir(first["imageId"]).exists())
    assert not (settings.media_file_dir(first["sourceFileId"]).exists())
    assert second["imageId"] in active_media_refs()

    delete_post(created["id"])
    assert second["imageId"] in active_media_refs()
    assert settings.media_image_dir(second["imageId"]).exists()
    assert settings.media_file_dir(second["sourceFileId"]).exists()
    assert list_posts()["total"] == 0

    trash = list_trash(role="site_admin", email="admin@example.com")["items"][0]
    purge_trash_item(
        trash["id"],
        role="site_admin",
        email="admin@example.com",
    )
    assert second["imageId"] not in active_media_refs()
    assert not (settings.media_image_dir(second["imageId"]).exists())
    assert not (settings.media_file_dir(second["sourceFileId"]).exists())


def test_admin_api_authz(isolated_data):
    client = TestClient(app)
    image = _make_image()

    def override_manager():
        return _page_manager()

    def override_other_manager():
        return _page_manager("other-manager@example.com")

    def override_no_access():
        return _no_posts_access()

    def override_page_admin():
        return _page_admin()

    app.dependency_overrides[get_current_cms_user] = override_no_access
    denied = client.get("/api/v1/admin/posts")
    assert denied.status_code == 403

    app.dependency_overrides[get_current_cms_user] = override_manager
    created = client.post(
        "/api/v1/admin/posts",
        json={
            "enabled": True,
            "pinned": True,
            "images": [image],
            "copies": {"en": {"body": "<p>mine</p>"}},
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["pinned"] is False
    assert body["createdBy"] == "manager@example.com"
    post_id = body["id"]

    app.dependency_overrides[get_current_cms_user] = override_other_manager
    forbidden = client.put(
        f"/api/v1/admin/posts/{post_id}",
        json={
            "enabled": True,
            "pinned": False,
            "contentRevision": 1,
            "images": [image],
            "copies": {"en": {"body": "<p>hack</p>"}},
        },
    )
    assert forbidden.status_code == 403
    forbidden_delete = client.delete(f"/api/v1/admin/posts/{post_id}")
    assert forbidden_delete.status_code == 403

    app.dependency_overrides[get_current_cms_user] = override_page_admin
    ok = client.put(
        f"/api/v1/admin/posts/{post_id}",
        json={
            "enabled": True,
            "pinned": True,
            "contentRevision": 1,
            "images": [image],
            "copies": {"en": {"body": "<p>admin</p>"}},
        },
    )
    assert ok.status_code == 200
    assert ok.json()["pinned"] is True

    conflict = client.put(
        f"/api/v1/admin/posts/{post_id}",
        json={
            "enabled": True,
            "pinned": True,
            "contentRevision": 1,
            "images": [image],
            "copies": {"en": {"body": "<p>stale</p>"}},
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["contentRevision"] == 2

    listed = client.get("/api/v1/admin/posts?limit=10&offset=0")
    assert listed.status_code == 200
    envelope = listed.json()
    assert envelope["total"] == 1
    assert envelope["limit"] == 10
    assert len(envelope["items"]) == 1

    app.dependency_overrides.clear()


def test_admin_api_site_admin_delete(isolated_data):
    client = TestClient(app)
    image = _make_image()

    app.dependency_overrides[get_current_cms_user] = lambda: _site_admin()
    created = client.post(
        "/api/v1/admin/posts",
        json={"enabled": True, "images": [image], "copies": {}},
    )
    assert created.status_code == 201
    post_id = created.json()["id"]
    deleted = client.delete(f"/api/v1/admin/posts/{post_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/admin/posts?limit=10").json()["total"] == 0
    trash = client.get("/api/v1/admin/posts/trash").json()
    assert trash["total"] == 1
    assert trash["items"][0]["post"]["id"] == post_id
    app.dependency_overrides.clear()


def test_posts_trash_moves_and_restores(isolated_data):
    image = _make_image()
    created = create_post(
        {
            "enabled": True,
            "images": [image],
            "copies": {"en": {"body": "<p>draft</p>"}},
        },
        created_by="manager@example.com",
        role="page_manager",
    )

    trash = move_to_trash(created["id"], deleted_by="manager@example.com")
    assert list_posts()["total"] == 0
    assert trash["post"]["id"] == created["id"]
    assert trash["post"]["createdBy"] == "manager@example.com"
    assert set(active_media_refs()) >= {image["imageId"], image["sourceFileId"]}

    restored = restore_trash_item(
        trash["id"],
        role="page_manager",
        email="manager@example.com",
    )
    assert restored["id"] == created["id"]
    assert list_posts()["total"] == 1
    assert restored["copies"]["en"]["body"] == "<p>draft</p>"
    assert list_trash(role="page_manager", email="manager@example.com")["items"] == []

    second = create_post(
        {"enabled": True, "images": [_make_image()], "copies": {}},
        created_by="manager@example.com",
        role="page_manager",
    )
    second_trash = move_to_trash(second["id"], deleted_by="manager@example.com")
    purge_trash_item(
        second_trash["id"],
        role="page_manager",
        email="manager@example.com",
    )
    assert list_trash(role="page_manager", email="manager@example.com")["items"] == []
    assert not Path(settings.media_image_dir(second["media"][0]["imageId"])).exists()
    assert not Path(settings.media_file_dir(second["media"][0]["sourceFileId"])).exists()


def test_posts_trash_api_maps_permission_and_conflict_errors(isolated_data):
    client = TestClient(app)
    created = create_post(
        {"enabled": True, "images": [_make_image()], "copies": {}},
        created_by="manager@example.com",
        role="page_manager",
    )
    trash = move_to_trash(created["id"], deleted_by="manager@example.com")

    app.dependency_overrides[get_current_cms_user] = lambda: _page_manager(
        "other@example.com"
    )
    forbidden_restore = client.post(
        f"/api/v1/admin/posts/trash/{trash['id']}/restore"
    )
    forbidden_purge = client.delete(f"/api/v1/admin/posts/trash/{trash['id']}")
    assert forbidden_restore.status_code == 403
    assert forbidden_purge.status_code == 403

    posts_service._save_store({"posts": [trash["post"]]})
    app.dependency_overrides[get_current_cms_user] = lambda: _site_admin()
    conflict = client.post(
        f"/api/v1/admin/posts/trash/{trash['id']}/restore"
    )
    assert conflict.status_code == 409

    app.dependency_overrides.clear()


def test_active_media_refs_is_single_seam(isolated_data):
    image = _make_image()
    create_post(
        {"enabled": True, "images": [image], "copies": {}},
        created_by="admin@example.com",
        role="site_admin",
    )
    refs = active_media_refs()
    assert image["imageId"] in refs
    assert image["sourceFileId"] in refs
    assert Path(settings.media_image_dir(image["imageId"])).exists()


def test_rejects_invalid_source_file_id(isolated_data):
    image = _make_image()
    with pytest.raises(PostsValidationError, match="sourceFileId not found"):
        create_post(
            {
                "enabled": True,
                "images": [{**image, "sourceFileId": "missing-file-id"}],
                "copies": {},
            },
            created_by="admin@example.com",
            role="site_admin",
        )

    other = _make_image()
    with pytest.raises(PostsValidationError, match="sourceFileId does not match"):
        create_post(
            {
                "enabled": True,
                "images": [
                    {
                        **image,
                        "sourceFileId": other["sourceFileId"],
                    }
                ],
                "copies": {},
            },
            created_by="admin@example.com",
            role="site_admin",
        )
