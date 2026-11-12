from fastapi.testclient import TestClient

from core.config import settings
from main import app
from middleware.body_size_limit import MULTIPART_OVERHEAD_BYTES

JSON_ENDPOINT = "/api/v1/auth/send-code"
UPLOAD_ENDPOINT = "/api/v1/media/files"
BACKUP_UPLOAD_ENDPOINT = "/api/v1/admin/backups/import"


def _oversized_json(size: int) -> dict[str, str]:
    return {"email": "a" * size}


def test_declared_length_over_limit_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "max_request_body_bytes", 100)
    client = TestClient(app)

    response = client.post(JSON_ENDPOINT, json=_oversized_json(500))

    assert response.status_code == 413


def test_chunked_body_over_limit_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "max_request_body_bytes", 100)
    client = TestClient(app)

    def chunks():
        for _ in range(10):
            yield b'{"email":"' + b"a" * 50 + b'"}'

    response = client.post(
        JSON_ENDPOINT,
        content=chunks(),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413


def test_body_within_limit_reaches_the_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "max_request_body_bytes", 1024)
    client = TestClient(app)

    response = client.post(JSON_ENDPOINT, json={"email": "nobody@example.com"})

    assert response.status_code != 413


def test_upload_endpoint_uses_the_media_limit(monkeypatch):
    monkeypatch.setattr(settings, "max_request_body_bytes", 100)
    monkeypatch.setattr(settings, "media_max_file_bytes", 4096)
    client = TestClient(app)

    response = client.post(
        UPLOAD_ENDPOINT,
        files={"file": ("a.png", b"x" * 2048, "image/png")},
    )

    assert response.status_code == 401


def test_upload_endpoint_rejects_body_beyond_media_limit(monkeypatch):
    monkeypatch.setattr(settings, "media_max_file_bytes", 100)
    client = TestClient(app)

    response = client.post(
        UPLOAD_ENDPOINT,
        files={"file": ("a.png", b"x" * (MULTIPART_OVERHEAD_BYTES + 200), "image/png")},
    )

    assert response.status_code == 413


def test_backup_upload_uses_the_configured_archive_limit(monkeypatch):
    monkeypatch.setattr(settings, "backup_max_archive_bytes", 100)
    client = TestClient(app)

    response = client.post(
        BACKUP_UPLOAD_ENDPOINT,
        files={"file": ("backup.zip", b"x" * 10, "application/zip")},
    )

    assert response.status_code == 401


def test_backup_upload_rejects_body_beyond_archive_limit(monkeypatch):
    monkeypatch.setattr(settings, "backup_max_archive_bytes", 100)
    client = TestClient(app)

    response = client.post(
        BACKUP_UPLOAD_ENDPOINT,
        files={
            "file": (
                "backup.zip",
                b"x" * (MULTIPART_OVERHEAD_BYTES + 200),
                "application/zip",
            )
        },
    )

    assert response.status_code == 413
