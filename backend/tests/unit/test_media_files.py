"""media_files_service (ticket 022)."""

import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services.media_files_service import (
    MediaFilesNotFoundError,
    MediaFilesValidationError,
    delete_file,
    get_file_record,
    normalize_content_type,
    resolve_max_size_bytes,
    save_file,
)

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
PDF_BYTES = b"%PDF-1.4 minimal"


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "media_max_file_bytes", 1024)
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


def test_save_and_get_file(isolated_data):
    saved = save_file(
        b"hello",
        original_name="note.txt",
        content_type="text/plain",
    )
    assert saved["originalName"] == "note.txt"
    assert saved["contentType"] == "text/plain"
    assert saved["sizeBytes"] == 5
    assert saved["url"] == f"/api/v1/media/files/{saved['id']}"

    record = get_file_record(saved["id"])
    assert record["path"].read_bytes() == b"hello"
    assert (
        isolated_data / "data" / "media" / "files" / saved["id"] / "original.txt"
    ).is_file()
    assert (isolated_data / "data" / "media" / "files" / saved["id"] / "meta.json").is_file()


def test_normalize_collapses_duplicate_extension(isolated_data):
    saved = save_file(
        PDF_BYTES,
        original_name="Retourenlabel.pdf.pdf",
        content_type="application/pdf",
    )
    assert saved["originalName"] == "Retourenlabel.pdf"
    assert (
        isolated_data / "data" / "media" / "files" / saved["id"] / "original.pdf"
    ).is_file()


def test_rejects_oversize_file(isolated_data):
    with pytest.raises(MediaFilesValidationError):
        save_file(
            b"x" * 1025,
            original_name="big.bin",
            content_type="application/octet-stream",
        )


def test_request_max_size_rejects_over_requested_cap(isolated_data, monkeypatch):
    monkeypatch.setattr(settings, "media_max_file_bytes", 100)
    with pytest.raises(MediaFilesValidationError):
        save_file(
            b"x" * 50,
            original_name="a.bin",
            content_type="application/octet-stream",
            max_size_bytes=40,
        )


def test_request_max_size_clamped_to_server_cap(isolated_data, monkeypatch):
    monkeypatch.setattr(settings, "media_max_file_bytes", 100)
    assert resolve_max_size_bytes(500) == 100
    saved = save_file(
        b"x" * 90,
        original_name="ok.bin",
        content_type="application/octet-stream",
        max_size_bytes=500,
    )
    assert saved["sizeBytes"] == 90


def test_accept_mime_filter(isolated_data):
    with pytest.raises(MediaFilesValidationError):
        save_file(
            PDF_BYTES,
            original_name="doc.pdf",
            content_type="application/pdf",
            accept="image/png,image/jpeg",
        )

    saved = save_file(
        PNG_BYTES,
        original_name="pic.png",
        content_type="image/png",
        accept="image/*",
    )
    assert saved["contentType"] == "image/png"


def test_rejects_mime_spoof(isolated_data):
    with pytest.raises(MediaFilesValidationError, match="does not match"):
        save_file(
            PDF_BYTES,
            original_name="fake.png",
            content_type="image/png",
            accept="image/*",
        )


def test_rejects_dangerous_upload_content_type(isolated_data):
    with pytest.raises(MediaFilesValidationError, match="not allowed"):
        save_file(
            b"<script>alert(1)</script>",
            original_name="x.html",
            content_type="text/html",
        )


@pytest.mark.parametrize(
    "declared_type",
    [
        "text/html; charset=utf-8",
        "TEXT/HTML;x",
        "image/svg+xml;x",
        "IMAGE/SVG+XML ; charset=utf-8",
        "application/javascript;charset=utf-8",
        "text/xml\t;a=b",
    ],
)
def test_rejects_dangerous_type_with_mime_parameters(isolated_data, declared_type):
    with pytest.raises(MediaFilesValidationError, match="not allowed"):
        save_file(
            b"<script>alert(1)</script>",
            original_name="x.html",
            content_type=declared_type,
        )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("image/png; charset=binary", "image/png"),
        ("  IMAGE/PNG  ", "image/png"),
        ("image/jpg", "image/jpeg"),
        ("", "application/octet-stream"),
        (None, "application/octet-stream"),
        ("not a mime", "application/octet-stream"),
        ("text/html,text/plain", "application/octet-stream"),
        ("text/html\x00", "application/octet-stream"),
    ],
)
def test_normalize_content_type(raw, expected):
    assert normalize_content_type(raw) == expected


def test_parameterized_image_type_is_stored_normalized(isolated_data):
    saved = save_file(
        PNG_BYTES,
        original_name="pic.png",
        content_type="image/png; foo=bar",
    )
    assert saved["contentType"] == "image/png"


def test_upload_api_rejects_html_with_parameters(isolated_data):
    app.dependency_overrides[get_current_cms_user] = _page_admin
    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/media/files",
            files={"file": ("x.html", b"<script>1</script>", "text/html; charset=utf-8")},
        )
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_get_serves_image_inline_with_its_type(isolated_data):
    saved = save_file(PNG_BYTES, original_name="pic.png", content_type="image/png")
    response = TestClient(app).get(f"/api/v1/media/files/{saved['id']}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["content-disposition"].lower().startswith("inline")
    assert response.headers["x-content-type-options"] == "nosniff"


def test_get_serves_mp4_inline_with_its_type(isolated_data):
    content = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00"
    saved = save_file(
        content,
        original_name="clip.mp4",
        content_type="video/mp4",
    )
    response = TestClient(app).get(f"/api/v1/media/files/{saved['id']}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.headers["content-disposition"].lower().startswith("inline")
    assert response.content == content


def test_get_serves_pdf_inline(isolated_data):
    saved = save_file(PDF_BYTES, original_name="doc.pdf", content_type="application/pdf")
    response = TestClient(app).get(f"/api/v1/media/files/{saved['id']}")
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"].lower().startswith("inline")


@pytest.mark.parametrize(
    ("name", "declared_type"),
    [
        ("note.txt", "text/plain"),
        (
            "sheet.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
        ("bundle.zip", "application/zip"),
        ("page.html", "application/octet-stream"),
        ("vector.svg", "application/octet-stream"),
    ],
)
def test_get_forces_download_for_non_inline_types(isolated_data, name, declared_type):
    saved = save_file(
        b"<html><script>alert(1)</script></html>",
        original_name=name,
        content_type=declared_type,
    )
    response = TestClient(app).get(f"/api/v1/media/files/{saved['id']}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"].lower().startswith("attachment")
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "legacy_type",
    ["text/html; charset=utf-8", "image/svg+xml;x", "text/plain", "image/png; x=y"],
)
def test_get_normalizes_legacy_meta_content_type(isolated_data, legacy_type):
    saved = save_file(PNG_BYTES, original_name="pic.png", content_type="image/png")
    meta_path = (
        isolated_data / "data" / "media" / "files" / saved["id"] / "meta.json"
    )
    meta_path.write_text(
        meta_path.read_text(encoding="utf-8").replace(
            '"contentType": "image/png"', f'"contentType": "{legacy_type}"'
        ),
        encoding="utf-8",
    )
    response = TestClient(app).get(f"/api/v1/media/files/{saved['id']}")
    assert response.status_code == 200
    if legacy_type.startswith("image/png"):
        assert response.headers["content-type"] == "image/png"
        assert response.headers["content-disposition"].lower().startswith("inline")
    else:
        assert response.headers["content-type"] == "application/octet-stream"
        assert response.headers["content-disposition"].lower().startswith("attachment")


def test_download_query_forces_attachment_for_inline_type(isolated_data):
    saved = save_file(PNG_BYTES, original_name="pic.png", content_type="image/png")
    response = TestClient(app).get(
        f"/api/v1/media/files/{saved['id']}", params={"download": "true"}
    )
    assert response.headers["content-disposition"].lower().startswith("attachment")


def test_accept_extension_filter(isolated_data):
    with pytest.raises(MediaFilesValidationError):
        save_file(
            b"data",
            original_name="notes.txt",
            content_type="text/plain",
            accept=".pdf",
        )

    saved = save_file(
        PDF_BYTES,
        original_name="doc.PDF",
        content_type="application/octet-stream",
        accept=".pdf",
    )
    assert saved["originalName"] == "doc.PDF"


def test_delete_file_removes_directory(isolated_data):
    saved = save_file(
        b"bye",
        original_name="bye.txt",
        content_type="text/plain",
    )
    file_dir = isolated_data / "data" / "media" / "files" / saved["id"]
    assert file_dir.is_dir()

    delete_file(saved["id"])
    assert not file_dir.exists()

    with pytest.raises(MediaFilesNotFoundError):
        get_file_record(saved["id"])


def test_upload_api_requires_cms_user(isolated_data):
    app.dependency_overrides[get_current_cms_user] = _page_admin
    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/media/files",
            files={"file": ("a.txt", b"hello", "text/plain")},
        )
        assert response.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_upload_api_rejects_anonymous(isolated_data):
    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/media/files",
            files={"file": ("a.txt", b"hello", "text/plain")},
        )
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_upload_get_delete_api_as_site_admin(isolated_data):
    app.dependency_overrides[get_current_cms_user] = _site_admin
    client = TestClient(app)
    try:
        upload = client.post(
            "/api/v1/media/files",
            files={"file": ("hello.txt", b"hello", "text/plain")},
            params={"accept": "text/plain", "max_size_bytes": 512},
        )
        assert upload.status_code == 200
        body = upload.json()
        file_id = body["id"]
        assert body["originalName"] == "hello.txt"
        assert body["sizeBytes"] == 5

        download = client.get(f"/api/v1/media/files/{file_id}")
        assert download.status_code == 200
        assert download.content == b"hello"
        assert download.headers.get("x-content-type-options") == "nosniff"

        deleted = client.delete(f"/api/v1/media/files/{file_id}")
        assert deleted.status_code == 204

        missing = client.get(f"/api/v1/media/files/{file_id}")
        assert missing.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_upload_api_rejects_oversize_without_full_buffer(isolated_data):
    app.dependency_overrides[get_current_cms_user] = _site_admin
    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/media/files",
            files={"file": ("big.bin", b"x" * 2048, "application/octet-stream")},
            params={"max_size_bytes": 100},
        )
        assert response.status_code == 400
        assert "maximum size" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_get_file_is_public(isolated_data):
    saved = save_file(
        b"public",
        original_name="public.txt",
        content_type="text/plain",
    )
    client = TestClient(app)
    response = client.get(f"/api/v1/media/files/{saved['id']}")
    assert response.status_code == 200
    assert response.content == b"public"
    assert response.headers.get("x-content-type-options") == "nosniff"


def test_get_forces_attachment_for_html_meta(isolated_data):
    # Bypass upload rejection to simulate legacy/corrupt meta on disk.
    saved = save_file(
        b"hello",
        original_name="note.txt",
        content_type="text/plain",
    )
    meta_path = (
        isolated_data / "data" / "media" / "files" / saved["id"] / "meta.json"
    )
    meta_path.write_text(
        meta_path.read_text(encoding="utf-8").replace(
            '"contentType": "text/plain"',
            '"contentType": "text/html"',
        ),
        encoding="utf-8",
    )
    client = TestClient(app)
    response = client.get(f"/api/v1/media/files/{saved['id']}")
    assert response.status_code == 200
    disposition = response.headers.get("content-disposition", "")
    assert "attachment" in disposition.lower()
