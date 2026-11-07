"""Store lock behaviour: publish runs outside the lock, concurrent saves finish, sources are indexed."""

import json
import threading
import uuid
from io import BytesIO

import pytest
from PIL import Image

from core.config import settings
from core.store_lock import STORE_LOCK
from services import blogger_service
from services.blogger_draft_service import upsert_draft_for_user
from services.blogger_service import (
    BloggerConflictError,
    create_blogger,
    update_blogger,
)
from services.image_optimize_service import (
    ImageOptimizeValidationError,
    optimize_publish_from_file_id,
)
from services.media_files_service import save_file


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    return tmp_path


def _png_bytes(width: int, height: int) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), color=(20, 120, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def _image_body(media_id: str, width: int = 600) -> str:
    return (
        f'<p><img data-media-id="{media_id}" data-media-width="{width}" '
        f'src="/api/v1/media/files/{media_id}"></p>'
    )


def _fake_publish_result(image_id: str | None = None) -> dict:
    image_id = image_id or str(uuid.uuid4())
    return {
        "imageId": image_id,
        "displayUrl": f"/api/v1/media/images/{image_id}/display",
        "created": False,
    }


def _probe_store_lock_from_another_thread() -> bool:
    outcome: dict[str, bool] = {}

    def probe() -> None:
        acquired = STORE_LOCK.acquire(timeout=2)
        if acquired:
            STORE_LOCK.release()
        outcome["acquired"] = acquired

    worker = threading.Thread(target=probe)
    worker.start()
    worker.join(timeout=5)
    return outcome.get("acquired", False)


def test_publish_runs_without_holding_the_store_lock(isolated_data, monkeypatch):
    observed: list[bool] = []
    source = save_file(_png_bytes(1000, 500), original_name="a.png", content_type="image/png")

    def probing_publish(file_id: str, width: int) -> dict:
        observed.append(_probe_store_lock_from_another_thread())
        return _fake_publish_result()

    monkeypatch.setattr(blogger_service, "optimize_publish_from_file_id", probing_publish)

    create_blogger(
        {
            "copies": {
                "ko": {"title": "사진", "body": _image_body(source["id"])},
            },
        },
        created_by="admin@example.com",
        role="site_admin",
    )

    assert observed == [True]


def test_update_is_rejected_when_another_save_lands_during_publish(isolated_data, monkeypatch):
    source = save_file(_png_bytes(1000, 500), original_name="a.png", content_type="image/png")
    created = create_blogger(
        {"published": False, "copies": {"ko": {"title": "첫 글", "body": "<p>a</p>"}}},
        created_by="admin@example.com",
        role="site_admin",
    )

    def publish_while_someone_else_saves(file_id: str, width: int) -> dict:
        update_blogger(
            created["id"],
            {
                "published": False,
                "contentRevision": created["contentRevision"],
                "copies": {"ko": {"title": "다른 수정", "body": "<p>b</p>"}},
            },
            role="site_admin",
            created_by="admin@example.com",
        )
        return _fake_publish_result()

    monkeypatch.setattr(blogger_service, "optimize_publish_from_file_id", publish_while_someone_else_saves)

    with pytest.raises(BloggerConflictError):
        update_blogger(
            created["id"],
            {
                "published": True,
                "contentRevision": created["contentRevision"],
                "copies": {"ko": {"title": "늦은 수정", "body": _image_body(source["id"])}},
            },
            role="site_admin",
            created_by="admin@example.com",
        )

    stored = blogger_service.get_blogger(created["id"])
    assert stored["copies"]["ko"]["title"] == "다른 수정"


def test_concurrent_blogger_updates_and_draft_saves_finish_without_deadlock(isolated_data):
    created = create_blogger(
        {"published": False, "copies": {"ko": {"title": "시작", "body": "<p>0</p>"}}},
        created_by="admin@example.com",
        role="site_admin",
    )
    errors: list[BaseException] = []
    rounds = 25

    def update_loop() -> None:
        try:
            revision = created["contentRevision"]
            for index in range(rounds):
                try:
                    result = update_blogger(
                        created["id"],
                        {
                            "published": False,
                            "contentRevision": revision,
                            "copies": {"ko": {"title": f"수정 {index}", "body": f"<p>{index}</p>"}},
                        },
                        role="site_admin",
                        created_by="admin@example.com",
                    )
                    revision = result["contentRevision"]
                except BloggerConflictError as error:
                    revision = error.item["contentRevision"]
        except BaseException as error:  # noqa: BLE001
            errors.append(error)

    def draft_loop() -> None:
        try:
            revision: int | None = None
            for index in range(rounds):
                payload = {"copies": {"ko": {"title": f"초안 {index}", "body": "<p>draft</p>"}}}
                if revision is not None:
                    payload["contentRevision"] = revision
                draft = upsert_draft_for_user(payload, email="admin@example.com")
                revision = draft["contentRevision"]
        except BaseException as error:  # noqa: BLE001
            errors.append(error)

    workers = [threading.Thread(target=update_loop), threading.Thread(target=draft_loop)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=30)

    assert not any(worker.is_alive() for worker in workers)
    assert errors == []


def test_publish_writes_method_four_encoder_metadata(isolated_data):
    source = save_file(_png_bytes(1000, 500), original_name="wide.png", content_type="image/png")

    result = optimize_publish_from_file_id(source["id"], 600)

    meta_path = settings.media_images_dir / result["imageId"] / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["encoderMethod"] == 4
    assert meta["encoderQuality"] == 85


def test_publish_reuse_is_found_through_the_source_file_index(isolated_data):
    source = save_file(_png_bytes(1000, 500), original_name="wide.png", content_type="image/png")

    first = optimize_publish_from_file_id(source["id"], 600)
    second = optimize_publish_from_file_id(source["id"], 600)

    assert second["created"] is False
    assert second["imageId"] == first["imageId"]
    source_meta = json.loads(
        (settings.media_files_dir / source["id"] / "meta.json").read_text(encoding="utf-8")
    )
    assert source_meta["derivedImageIds"] == [first["imageId"]]


def test_publish_rejects_images_between_the_warning_and_error_pixel_limits(isolated_data, monkeypatch):
    monkeypatch.setattr("services.image_optimize_service.Image.MAX_IMAGE_PIXELS", 1000)
    source = save_file(_png_bytes(40, 40), original_name="edge.png", content_type="image/png")

    with pytest.raises(ImageOptimizeValidationError, match="too large"):
        optimize_publish_from_file_id(source["id"], 32)
