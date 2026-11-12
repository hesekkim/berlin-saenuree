import io
import json
import os
import zipfile
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from services import backups_service


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "backup_password", "test-backup-password")
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


def _client(user=None):
    app.dependency_overrides[get_current_cms_user] = lambda: user or _site_admin()
    return TestClient(app)


def test_backup_includes_data_and_media_but_excludes_verification_codes(
    isolated_data,
):
    data_dir = settings.data_dir
    data_dir.mkdir(parents=True)
    (data_dir / "posts.json").write_text('{"posts":[]}', encoding="utf-8")
    (data_dir / "verification_codes.json").write_text('{"codes":[]}', encoding="utf-8")
    media_file = data_dir / "media" / "files" / "sample" / "original.pdf"
    media_file.parent.mkdir(parents=True)
    media_file.write_bytes(b"media-content")

    backup = backups_service.create_backup()
    path = backups_service.get_backup_file(backup["id"])
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        assert "data/posts.json" in names
        assert "data/media/files/sample/original.pdf" in names
        assert "data/verification_codes.json" not in names
        manifest = json.loads(archive.read("manifest.json"))
    assert manifest["siteId"] == settings.jwt_issuer
    assert backup["kind"] == "manual"
    assert backup["isValid"] is True


def test_monthly_backup_replaces_corrupt_archive(isolated_data):
    settings.data_dir.mkdir(parents=True)
    (settings.data_dir / "posts.json").write_text(
        '{"posts":["original"]}', encoding="utf-8"
    )
    month = datetime(2026, 1, 1, tzinfo=timezone.utc)
    backups_service.ensure_monthly_backup(month)
    original_backup = backups_service.list_backups()["backups"][0]
    original_path = backups_service.get_backup_file(original_backup["id"])
    corrupt_path = original_path.with_suffix(".tmp")

    with zipfile.ZipFile(original_path, "r") as source:
        with zipfile.ZipFile(corrupt_path, "w") as corrupted:
            for name in source.namelist():
                contents = source.read(name)
                if name == "data/posts.json":
                    contents = b'{"posts":["tampered"]}'
                corrupted.writestr(name, contents)
    os.replace(corrupt_path, original_path)

    assert backups_service.list_backups()["backups"][0]["isValid"] is False

    backups_service.ensure_monthly_backup(month)

    listed = backups_service.list_backups()["backups"]
    assert len(listed) == 2
    assert sum(backup["isValid"] for backup in listed) == 1


def test_restore_creates_safety_backup_and_replaces_data(isolated_data):
    settings.data_dir.mkdir(parents=True)
    original = settings.data_dir / "posts.json"
    original.write_text('{"posts":["before"]}', encoding="utf-8")
    (settings.data_dir / "verification_codes.json").write_text(
        '{"codes":["old"]}', encoding="utf-8"
    )
    backup = backups_service.create_backup()
    original.write_text('{"posts":["current"]}', encoding="utf-8")

    result = backups_service.restore_backup(backup["id"], "test-backup-password")

    assert result["restored"] is True
    assert json.loads(original.read_text(encoding="utf-8")) == {"posts": ["before"]}
    assert not settings.verification_codes_file.exists()
    listed = backups_service.list_backups()["backups"]
    assert any(item["id"] == result["safetyBackupId"] for item in listed)
    assert any(item["kind"] == "pre_restore" for item in listed)


def test_imported_export_can_be_restored(isolated_data):
    settings.data_dir.mkdir(parents=True)
    content = settings.data_dir / "pages" / "home.json"
    content.parent.mkdir()
    content.write_text('{"title":"restored"}', encoding="utf-8")
    backup = backups_service.create_backup()
    archive_path = backups_service.get_backup_file(backup["id"])
    with archive_path.open("rb") as source:
        preview = backups_service.stage_import(source)

    content.write_text('{"title":"new"}', encoding="utf-8")
    result = backups_service.restore_import(
        preview["importId"], "test-backup-password"
    )

    assert json.loads(content.read_text(encoding="utf-8")) == {"title": "restored"}
    assert result["restored"] is True
    assert not (settings.backup_dir / ".imports" / f"{preview['importId']}.zip").exists()


def test_wrong_password_does_not_change_data(isolated_data):
    settings.data_dir.mkdir(parents=True)
    current = settings.data_dir / "value.json"
    current.write_text('{"value":"original"}', encoding="utf-8")
    backup = backups_service.create_backup()

    with pytest.raises(backups_service.BackupPasswordError):
        backups_service.restore_backup(backup["id"], "incorrect")

    assert json.loads(current.read_text(encoding="utf-8")) == {"value": "original"}


def test_restore_aborts_without_changing_data_when_safety_backup_fails(
    isolated_data, monkeypatch
):
    settings.data_dir.mkdir(parents=True)
    current = settings.data_dir / "value.json"
    current.write_text('{"value":"current"}', encoding="utf-8")
    backup = backups_service.create_backup()

    def fail_safety_backup(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(backups_service, "_create_backup_locked", fail_safety_backup)
    with pytest.raises(OSError, match="disk full"):
        backups_service.restore_backup(backup["id"], "test-backup-password")

    assert json.loads(current.read_text(encoding="utf-8")) == {"value": "current"}


def test_restore_rolls_back_directory_swap_failure(isolated_data, monkeypatch):
    settings.data_dir.mkdir(parents=True)
    current = settings.data_dir / "value.json"
    current.write_text('{"value":"current"}', encoding="utf-8")
    backup = backups_service.create_backup()
    real_replace = os.replace

    def fail_install(source, destination):
        if (
            str(destination) == str(settings.data_dir)
            and str(source).split("\\")[-1].startswith(".data-restore-")
        ):
            raise OSError("install failed")
        real_replace(source, destination)

    monkeypatch.setattr(backups_service.os, "replace", fail_install)
    with pytest.raises(OSError, match="install failed"):
        backups_service.restore_backup(backup["id"], "test-backup-password")

    assert json.loads(current.read_text(encoding="utf-8")) == {"value": "current"}


def test_restore_keeps_selected_backup_when_retention_is_full(isolated_data):
    settings.data_dir.mkdir(parents=True)
    current = settings.data_dir / "value.json"
    current.write_text('{"value":"restore-source"}', encoding="utf-8")
    backups = [backups_service.create_backup() for _ in range(12)]
    selected_id = backups[0]["id"]

    result = backups_service.restore_backup(selected_id, "test-backup-password")

    assert backups_service.get_backup_file(selected_id).is_file()
    assert backups_service.get_backup_file(result["safetyBackupId"]).is_file()
    assert len(backups_service.list_backups()["backups"]) == 12


def test_import_rejects_path_traversal(isolated_data):
    malicious = io.BytesIO()
    with zipfile.ZipFile(malicious, "w") as archive:
        archive.writestr("../outside.txt", "unsafe")
        archive.writestr("manifest.json", "{}")
    malicious.seek(0)

    with pytest.raises(backups_service.BackupValidationError):
        backups_service.stage_import(malicious)


def test_import_rejects_symlink_manifest(isolated_data):
    malicious = io.BytesIO()
    symlink = zipfile.ZipInfo("manifest.json")
    symlink.create_system = 3
    symlink.external_attr = (0o120777 << 16)
    with zipfile.ZipFile(malicious, "w") as archive:
        archive.writestr(
            symlink,
            json.dumps(
                {
                    "schemaVersion": 1,
                    "siteId": settings.jwt_issuer,
                    "createdAt": "2026-01-01T00:00:00+00:00",
                    "kind": "manual",
                    "files": [],
                }
            ),
        )
    malicious.seek(0)

    with pytest.raises(backups_service.BackupValidationError):
        backups_service.stage_import(malicious)


def test_invalid_utf8_manifest_is_reported_as_invalid_backup(isolated_data):
    malformed = io.BytesIO()
    with zipfile.ZipFile(malformed, "w") as archive:
        archive.writestr("manifest.json", b"\xff")
    malformed.seek(0)
    stored_path = (
        backups_service._backup_root()
        / f"20260101T000000Z-manual-{'a' * 32}.zip"
    )
    stored_path.write_bytes(malformed.getvalue())

    with pytest.raises(backups_service.BackupValidationError):
        backups_service.stage_import(io.BytesIO(malformed.getvalue()))

    listed = backups_service.list_backups()["backups"]
    assert len(listed) == 1
    assert listed[0]["isValid"] is False


def test_backup_storage_cannot_be_nested_under_data(isolated_data, monkeypatch):
    monkeypatch.setattr(
        settings,
        "backup_root",
        str(settings.data_dir / "backups"),
    )

    with pytest.raises(
        backups_service.BackupValidationError,
        match="outside the data directory",
    ):
        backups_service.create_backup()


def test_monthly_backup_is_created_once_and_retention_is_capped(
    isolated_data, monkeypatch
):
    first_month = datetime(2026, 1, 1, tzinfo=timezone.utc)
    backups_service.ensure_monthly_backup(first_month)
    backups_service.ensure_monthly_backup(first_month)
    assert len(backups_service.list_backups()["backups"]) == 1

    for _ in range(12):
        backups_service.create_backup()

    assert len(backups_service.list_backups()["backups"]) == 12


def test_backup_api_requires_site_admin_and_allows_upload_without_password(
    isolated_data,
):
    client = _client(_page_admin())
    try:
        assert client.get("/api/v1/admin/backups").status_code == 403
        assert client.post("/api/v1/admin/backups").status_code == 403
    finally:
        app.dependency_overrides.clear()

    client = _client()
    try:
        created = client.post("/api/v1/admin/backups")
        assert created.status_code == 200
        listed = client.get("/api/v1/admin/backups")
        assert listed.status_code == 200
        backup_id = created.json()["id"]
        downloaded = client.get(
            f"/api/v1/admin/backups/{backup_id}/download"
        )
        assert downloaded.status_code == 200
        uploaded = client.post(
            "/api/v1/admin/backups/import",
            files={"file": ("backup.zip", downloaded.content, "application/zip")},
        )
        assert uploaded.status_code == 200
        denied_delete = client.request(
            "DELETE",
            f"/api/v1/admin/backups/{backup_id}",
            json={"password": "wrong"},
        )
        assert denied_delete.status_code == 403
        deleted = client.request(
            "DELETE",
            f"/api/v1/admin/backups/{backup_id}",
            json={"password": "test-backup-password"},
        )
        assert deleted.status_code == 204
    finally:
        app.dependency_overrides.clear()


def test_backup_delete_requires_configured_correct_password(isolated_data, monkeypatch):
    backup = backups_service.create_backup()
    monkeypatch.setattr(settings, "backup_password", "")

    with pytest.raises(backups_service.BackupPasswordNotConfiguredError):
        backups_service.delete_backup(backup["id"], "anything")
    assert backups_service.get_backup_file(backup["id"]).is_file()
