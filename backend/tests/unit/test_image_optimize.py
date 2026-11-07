"""image_optimize_service (ticket 023)."""

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services.image_optimize_service import (
    DISPLAY_MAX_EDGE,
    THUMB_MAX_EDGE,
    ImageOptimizeNotFoundError,
    ImageOptimizeValidationError,
    delete_derivatives,
    get_image_variant,
    optimize_from_file_id,
    optimize_image_bytes,
    optimize_publish_from_file_id,
)
from services.media_files_service import save_file


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
        "name": "Page Admin",
        "role": "page_admin",
        "pages": ["home"],
        "effectivePages": ["home"],
        "adminLanguage": "en",
    }


def _png_bytes(width: int = 100, height: int = 80, color=(20, 120, 200)) -> bytes:
    image = Image.new("RGB", (width, height), color=color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _webp_bytes(width: int = 120, height: int = 90, color=(10, 200, 80)) -> bytes:
    image = Image.new("RGB", (width, height), color=color)
    buffer = BytesIO()
    image.save(buffer, format="WEBP", quality=80)
    return buffer.getvalue()


def _gif_bytes() -> bytes:
    image = Image.new("RGB", (40, 40), color=(255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="GIF")
    return buffer.getvalue()


def _animated_webp_bytes() -> bytes:
    frame1 = Image.new("RGB", (32, 32), color=(255, 0, 0))
    frame2 = Image.new("RGB", (32, 32), color=(0, 255, 0))
    buffer = BytesIO()
    frame1.save(
        buffer,
        format="WEBP",
        save_all=True,
        append_images=[frame2],
        duration=100,
        loop=0,
    )
    return buffer.getvalue()


def _jpeg_with_exif_orientation6() -> bytes:
    """Landscape pixels tagged orientation=6 (rotate 90 CW → portrait)."""
    image = Image.new("RGB", (80, 40), color=(200, 40, 40))
    exif = image.getexif()
    exif[274] = 6  # Orientation
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=90, exif=exif)
    return buffer.getvalue()


def test_optimize_creates_display_and_thumb(isolated_data):
    content = _png_bytes(2400, 1200)
    result = optimize_image_bytes(
        content,
        content_type="image/png",
        source_file_id="src-file",
        variants=["display", "thumb"],
    )

    assert result["sourceFileId"] == "src-file"
    assert result["width"] <= DISPLAY_MAX_EDGE
    assert result["height"] <= DISPLAY_MAX_EDGE
    assert max(result["width"], result["height"]) == DISPLAY_MAX_EDGE

    image_dir = isolated_data / "data" / "media" / "images" / result["imageId"]
    assert (image_dir / "display.webp").is_file()
    assert (image_dir / "thumb.webp").is_file()
    assert (image_dir / "meta.json").is_file()
    assert result["variants"] == ["display", "thumb"]

    display = Image.open(image_dir / "display.webp")
    thumb = Image.open(image_dir / "thumb.webp")
    assert max(display.size) == DISPLAY_MAX_EDGE
    assert max(thumb.size) <= THUMB_MAX_EDGE


def test_optimize_defaults_to_display_only(isolated_data):
    result = optimize_image_bytes(_png_bytes(800, 600), content_type="image/png")

    image_dir = isolated_data / "data" / "media" / "images" / result["imageId"]
    assert result["variants"] == ["display"]
    assert result["thumbUrl"] is None
    assert (image_dir / "display.webp").is_file()
    assert not (image_dir / "thumb.webp").exists()
    assert get_image_variant(result["imageId"], "display")["path"].is_file()
    with pytest.raises(ImageOptimizeNotFoundError):
        get_image_variant(result["imageId"], "thumb")


def test_optimize_rejects_thumb_without_display(isolated_data):
    with pytest.raises(ImageOptimizeValidationError, match="contain display"):
        optimize_image_bytes(
            _png_bytes(),
            content_type="image/png",
            variants=["thumb"],
        )


def test_optimize_accepts_webp(isolated_data):
    result = optimize_image_bytes(
        _webp_bytes(600, 400),
        content_type="image/webp",
    )
    assert result["width"] == 600
    assert result["height"] == 400
    display = get_image_variant(result["imageId"], "display")
    assert Image.open(display["path"]).format == "WEBP"


def test_optimize_applies_exif_orientation(isolated_data):
    result = optimize_image_bytes(
        _jpeg_with_exif_orientation6(),
        content_type="image/jpeg",
    )
    # Stored landscape 80x40 with orientation 6 → transposed 40x80
    assert result["width"] == 40
    assert result["height"] == 80


def test_optimize_rejects_gif(isolated_data):
    with pytest.raises(ImageOptimizeValidationError):
        optimize_image_bytes(_gif_bytes(), content_type="image/gif")


def test_optimize_rejects_animated_webp(isolated_data):
    with pytest.raises(ImageOptimizeValidationError, match="Animated"):
        optimize_image_bytes(_animated_webp_bytes(), content_type="image/webp")


def test_optimize_rejects_non_image(isolated_data):
    with pytest.raises(ImageOptimizeValidationError):
        optimize_image_bytes(b"not-an-image", content_type="image/png")


def test_optimize_rejects_unlisted_format_declared_as_png(isolated_data):
    buffer = BytesIO()
    Image.new("RGB", (20, 20), "red").save(buffer, format="BMP")
    with pytest.raises(ImageOptimizeValidationError, match="not a valid image"):
        optimize_image_bytes(buffer.getvalue(), content_type="image/png")


def test_optimize_rejects_oversize_bytes(isolated_data, monkeypatch):
    monkeypatch.setattr(settings, "media_max_file_bytes", 100)
    with pytest.raises(ImageOptimizeValidationError, match="maximum size"):
        optimize_image_bytes(
            _png_bytes(200, 200),
            content_type="image/png",
        )


def test_optimize_rejects_decompression_bomb(isolated_data, monkeypatch):
    monkeypatch.setattr(
        "services.image_optimize_service.Image.MAX_IMAGE_PIXELS",
        1000,
    )
    # 50x50 = 2500 pixels > patched limit
    with pytest.raises(ImageOptimizeValidationError, match="too large"):
        optimize_image_bytes(_png_bytes(50, 50), content_type="image/png")


def test_optimize_from_file_id_and_delete(isolated_data):
    saved = save_file(
        _png_bytes(800, 600),
        original_name="shot.png",
        content_type="image/png",
    )
    optimized = optimize_from_file_id(saved["id"], variants=["display", "thumb"])
    assert optimized["sourceFileId"] == saved["id"]
    assert optimized["imageId"] != saved["id"]

    display = get_image_variant(optimized["imageId"], "display")
    assert display["path"].is_file()

    delete_derivatives(optimized["imageId"])
    with pytest.raises(ImageOptimizeNotFoundError):
        get_image_variant(optimized["imageId"], "display")


def test_reoptimize_creates_new_image_id(isolated_data):
    saved = save_file(
        _png_bytes(100, 80),
        original_name="a.png",
        content_type="image/png",
    )
    first = optimize_from_file_id(saved["id"], variants=["display", "thumb"])
    second = optimize_from_file_id(saved["id"], variants=["display", "thumb"])
    assert first["imageId"] != second["imageId"]
    assert get_image_variant(first["imageId"], "thumb")["path"].is_file()
    assert get_image_variant(second["imageId"], "thumb")["path"].is_file()


def test_publish_optimize_uses_width_preserves_ratio_and_reuses_derivative(isolated_data):
    saved = save_file(
        _png_bytes(1000, 500),
        original_name="wide.png",
        content_type="image/png",
    )

    first = optimize_publish_from_file_id(saved["id"], 600)
    assert first["created"] is True
    assert (first["width"], first["height"]) == (600, 300)
    assert Image.open(get_image_variant(first["imageId"], "display")["path"]).size == (600, 300)

    second = optimize_publish_from_file_id(saved["id"], 600)
    assert second["created"] is False
    assert second["imageId"] == first["imageId"]


def test_publish_optimize_caps_to_original_width(isolated_data):
    saved = save_file(
        _png_bytes(500, 250),
        original_name="small.png",
        content_type="image/png",
    )

    result = optimize_publish_from_file_id(saved["id"], 1200)
    assert (result["width"], result["height"]) == (500, 250)


def test_optimize_api_requires_cms_user(isolated_data):
    saved = save_file(
        _png_bytes(),
        original_name="a.png",
        content_type="image/png",
    )
    app.dependency_overrides[get_current_cms_user] = _page_admin
    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/media/images/optimize",
            json={"fileId": saved["id"], "variants": ["display", "thumb"]},
        )
        assert response.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_optimize_get_delete_api_as_site_admin(isolated_data):
    saved = save_file(
        _png_bytes(500, 400),
        original_name="b.png",
        content_type="image/png",
    )
    app.dependency_overrides[get_current_cms_user] = _site_admin
    client = TestClient(app)
    try:
        optimize = client.post(
            "/api/v1/media/images/optimize",
            json={"fileId": saved["id"], "variants": ["display", "thumb"]},
        )
        assert optimize.status_code == 200
        body = optimize.json()
        image_id = body["imageId"]
        assert body["variants"] == ["display", "thumb"]
        assert body["displayUrl"].endswith(f"/images/{image_id}/display")
        assert body["thumbUrl"].endswith(f"/images/{image_id}/thumb")

        display = client.get(f"/api/v1/media/images/{image_id}/display")
        assert display.status_code == 200
        assert display.headers["content-type"].startswith("image/webp")
        assert display.headers.get("x-content-type-options") == "nosniff"
        assert "max-age" in (display.headers.get("cache-control") or "")

        thumb = client.get(f"/api/v1/media/images/{image_id}/thumb")
        assert thumb.status_code == 200
        assert thumb.headers.get("x-content-type-options") == "nosniff"

        deleted = client.delete(f"/api/v1/media/images/{image_id}")
        assert deleted.status_code == 204
        assert client.get(f"/api/v1/media/images/{image_id}/display").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_optimize_api_rejects_thumb_only_request(isolated_data):
    saved = save_file(
        _png_bytes(),
        original_name="c.png",
        content_type="image/png",
    )
    app.dependency_overrides[get_current_cms_user] = _site_admin
    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/media/images/optimize",
            json={"fileId": saved["id"], "variants": ["thumb"]},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_get_optimized_image_is_public(isolated_data):
    result = optimize_image_bytes(
        _png_bytes(),
        content_type="image/png",
        variants=["display", "thumb"],
    )
    client = TestClient(app)
    response = client.get(f"/api/v1/media/images/{result['imageId']}/thumb")
    assert response.status_code == 200
    assert response.headers.get("x-content-type-options") == "nosniff"
