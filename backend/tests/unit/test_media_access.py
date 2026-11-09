"""Media delete authorization, reference protection, unified refs (ticket 066)."""

import shutil
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services import popups_service
from services.blogger_draft_service import upsert_draft_for_user
from services.image_optimize_service import get_image_variant
from services.media_files_service import get_file_record, save_file
from services.media_refs import collect_active_media_refs
from services.popups_service import (
    PopupsValidationError,
    create_popup,
    delete_popup,
    update_popup,
)
from services.posts_service import create_post, delete_post, update_post


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "media_max_file_bytes", 5 * 1024 * 1024)
    yield tmp_path
    app.dependency_overrides.clear()


def _user(role: str, email: str):
    return {
        "email": email,
        "name": None if role == "site_admin" else email,
        "role": role,
        "pages": ["home", "posts", "blogger"],
        "effectivePages": ["home", "posts", "blogger"],
        "adminLanguage": "en",
    }


def _act_as(role: str, email: str) -> TestClient:
    app.dependency_overrides[get_current_cms_user] = lambda: _user(role, email)
    return TestClient(app)


def _png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (80, 60), color=(30, 140, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def _upload_and_optimize(client: TestClient) -> tuple[str, str]:
    uploaded = client.post(
        "/api/v1/media/files",
        files={"file": ("shot.png", _png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 200
    file_id = uploaded.json()["id"]
    optimized = client.post("/api/v1/media/images/optimize", json={"fileId": file_id})
    assert optimized.status_code == 200
    return file_id, optimized.json()["imageId"]


def _post_payload(file_id: str, image_id: str) -> dict:
    return {
        "published": True,
        "images": [
            {"imageId": image_id, "sourceFileId": file_id, "width": 80, "height": 60}
        ],
        "copies": {},
    }


def test_upload_and_optimize_record_uploader(isolated_data):
    client = _act_as("page_manager", "Manager@Example.com")
    file_id, image_id = _upload_and_optimize(client)

    assert get_file_record(file_id)["meta"]["uploadedBy"] == "manager@example.com"
    assert get_image_variant(image_id, "display")["meta"]["uploadedBy"] == (
        "manager@example.com"
    )


def test_delete_referenced_file_and_image_returns_409(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    file_id, image_id = _upload_and_optimize(client)
    create_post(
        _post_payload(file_id, image_id),
        created_by="admin@example.com",
        role="site_admin",
    )

    assert client.delete(f"/api/v1/media/files/{file_id}").status_code == 409
    assert client.delete(f"/api/v1/media/images/{image_id}").status_code == 409
    assert client.get(f"/api/v1/media/files/{file_id}").status_code == 200
    assert client.get(f"/api/v1/media/images/{image_id}/display").status_code == 200


def test_delete_unreferenced_own_media_succeeds(isolated_data):
    client = _act_as("page_manager", "manager@example.com")
    file_id, image_id = _upload_and_optimize(client)

    assert client.delete(f"/api/v1/media/files/{file_id}").status_code == 204
    assert client.get(f"/api/v1/media/files/{file_id}").status_code == 404
    assert client.get(f"/api/v1/media/images/{image_id}/display").status_code == 404


def test_page_manager_cannot_delete_other_users_media(isolated_data):
    owner = _act_as("page_manager", "owner@example.com")
    file_id, image_id = _upload_and_optimize(owner)

    other = _act_as("page_manager", "other@example.com")
    assert other.delete(f"/api/v1/media/files/{file_id}").status_code == 403
    assert other.delete(f"/api/v1/media/images/{image_id}").status_code == 403
    assert other.get(f"/api/v1/media/files/{file_id}").status_code == 200


def test_page_admin_cannot_delete_other_users_media(isolated_data):
    owner = _act_as("page_manager", "owner@example.com")
    file_id, _image_id = _upload_and_optimize(owner)

    page_admin = _act_as("page_admin", "pageadmin@example.com")
    assert page_admin.delete(f"/api/v1/media/files/{file_id}").status_code == 403


def test_site_admin_can_delete_other_users_unreferenced_media(isolated_data):
    owner = _act_as("page_manager", "owner@example.com")
    file_id, image_id = _upload_and_optimize(owner)

    admin = _act_as("site_admin", "admin@example.com")
    assert admin.delete(f"/api/v1/media/images/{image_id}").status_code == 204
    assert admin.delete(f"/api/v1/media/files/{file_id}").status_code == 204


def test_legacy_media_without_uploader_is_site_admin_only(isolated_data):
    legacy = save_file(_png_bytes(), original_name="old.png", content_type="image/png")
    assert get_file_record(legacy["id"])["meta"]["uploadedBy"] == ""

    manager = _act_as("page_manager", "manager@example.com")
    assert manager.delete(f"/api/v1/media/files/{legacy['id']}").status_code == 403

    admin = _act_as("site_admin", "admin@example.com")
    assert admin.delete(f"/api/v1/media/files/{legacy['id']}").status_code == 204


def test_delete_unknown_media_returns_404(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    missing = "00000000-0000-4000-8000-000000000000"
    assert client.delete(f"/api/v1/media/files/{missing}").status_code == 404
    assert client.delete(f"/api/v1/media/images/{missing}").status_code == 404


def test_delete_is_blocked_while_post_is_in_trash(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    file_id, image_id = _upload_and_optimize(client)
    post = create_post(
        _post_payload(file_id, image_id),
        created_by="admin@example.com",
        role="site_admin",
    )
    delete_post(post["id"], deleted_by="admin@example.com")

    assert client.delete(f"/api/v1/media/files/{file_id}").status_code == 409


def test_delete_is_blocked_while_draft_references_media(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    file_id, image_id = _upload_and_optimize(client)
    body = (
        f'<p><img data-media-id="{file_id}" src="/api/v1/media/files/{file_id}" '
        f'alt=""></p>'
    )
    upsert_draft_for_user(
        {"copies": {"en": {"title": "t", "body": body}}, "published": False},
        email="admin@example.com",
    )

    assert file_id in collect_active_media_refs()
    assert client.delete(f"/api/v1/media/files/{file_id}").status_code == 409
    assert client.delete(f"/api/v1/media/images/{image_id}").status_code == 204


def test_refs_include_popup_media(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    file_id, image_id = _upload_and_optimize(client)
    create_popup(
        {
            "name": "Poster",
            "type": "poster",
            "imageId": image_id,
            "sourceFileId": file_id,
            "copies": {},
        }
    )

    refs = collect_active_media_refs()
    assert {file_id, image_id} <= refs
    assert client.delete(f"/api/v1/media/files/{file_id}").status_code == 409
    assert client.delete(f"/api/v1/media/images/{image_id}").status_code == 409


def test_post_cleanup_does_not_delete_popup_media(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    shared_file, shared_image = _upload_and_optimize(client)
    other_file, other_image = _upload_and_optimize(client)
    create_popup(
        {
            "name": "Poster",
            "type": "poster",
            "imageId": shared_image,
            "sourceFileId": shared_file,
            "copies": {},
        }
    )
    post = create_post(
        _post_payload(shared_file, shared_image),
        created_by="admin@example.com",
        role="site_admin",
    )

    update_post(
        post["id"],
        {**_post_payload(other_file, other_image), "contentRevision": 1},
        role="site_admin",
    )

    assert get_file_record(shared_file)
    assert get_image_variant(shared_image, "display")


def test_popup_cleanup_does_not_delete_post_media(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    file_id, image_id = _upload_and_optimize(client)
    create_post(
        _post_payload(file_id, image_id),
        created_by="admin@example.com",
        role="site_admin",
    )
    popup = create_popup(
        {
            "name": "Poster",
            "type": "poster",
            "imageId": image_id,
            "sourceFileId": file_id,
            "copies": {},
        }
    )

    delete_popup(popup["id"])

    assert get_file_record(file_id)
    assert get_image_variant(image_id, "display")


def test_popup_replace_cleans_previous_media(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    old_file, old_image = _upload_and_optimize(client)
    new_file, new_image = _upload_and_optimize(client)
    popup = create_popup(
        {
            "name": "Poster",
            "type": "poster",
            "imageId": old_image,
            "sourceFileId": old_file,
            "copies": {},
        }
    )

    update_popup(
        popup["id"],
        {"name": "Poster", "imageId": new_image, "sourceFileId": new_file, "copies": {}},
    )

    assert client.get(f"/api/v1/media/files/{old_file}").status_code == 404
    assert client.get(f"/api/v1/media/images/{old_image}/display").status_code == 404
    assert client.get(f"/api/v1/media/files/{new_file}").status_code == 200


def test_popup_rejects_missing_source_file(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    _file_id, image_id = _upload_and_optimize(client)

    with pytest.raises(PopupsValidationError, match="sourceFileId not found"):
        create_popup(
            {
                "name": "Poster",
                "type": "poster",
                "imageId": image_id,
                "sourceFileId": "00000000-0000-4000-8000-000000000000",
                "copies": {},
            }
        )


def test_popup_rejects_source_file_that_does_not_match_image(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    _file_id, image_id = _upload_and_optimize(client)
    other_file, _other_image = _upload_and_optimize(client)

    with pytest.raises(PopupsValidationError, match="does not match"):
        create_popup(
            {
                "name": "Poster",
                "type": "poster",
                "imageId": image_id,
                "sourceFileId": other_file,
                "copies": {},
            }
        )


def test_popup_update_keeps_legacy_missing_source_editable(isolated_data):
    client = _act_as("site_admin", "admin@example.com")
    file_id, image_id = _upload_and_optimize(client)
    popup = create_popup(
        {
            "name": "Poster",
            "type": "poster",
            "imageId": image_id,
            "sourceFileId": file_id,
            "copies": {},
        }
    )
    # Simulate a legacy popup whose source file is already gone.
    shutil.rmtree(settings.media_file_dir(file_id))

    updated = popups_service.update_popup(
        popup["id"],
        {"name": "Renamed", "imageId": image_id, "sourceFileId": file_id, "copies": {}},
    )
    assert updated["name"] == "Renamed"
