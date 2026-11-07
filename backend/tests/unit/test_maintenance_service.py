"""Tests for the orphan media sweep and the scheduled maintenance pass."""

import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from core.config import settings
from services import maintenance_service
from services.maintenance_service import (
    ORPHAN_GRACE_SECONDS,
    run_maintenance,
    sweep_orphan_media,
)


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    monkeypatch.setattr(settings, "posts_trash_retention_days", 30)
    monkeypatch.setattr(settings, "blogger_trash_retention_days", 30)
    monkeypatch.setattr(settings, "media_gc_dry_run", False)
    return tmp_path


@pytest.fixture
def live_refs(monkeypatch):
    refs: set[str] = set()
    monkeypatch.setattr(maintenance_service, "collect_active_media_refs", lambda: set(refs))
    return refs


def _aged_iso(seconds_old: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds_old)).isoformat()


def _make_media_dir(root, media_id: str, meta: dict | None, *, seconds_old: float) -> None:
    directory = root / media_id
    directory.mkdir(parents=True)
    (directory / "payload.bin").write_bytes(b"data")
    if meta is not None:
        (directory / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    stamp = (datetime.now(timezone.utc) - timedelta(seconds=seconds_old)).timestamp()
    os.utime(directory, (stamp, stamp))


def _make_file(media_id: str, *, seconds_old: float) -> None:
    _make_media_dir(
        settings.media_files_dir,
        media_id,
        {"createdAt": _aged_iso(seconds_old)},
        seconds_old=seconds_old,
    )


def _make_image(image_id: str, source_file_id: str | None, *, seconds_old: float) -> None:
    meta = {"createdAt": _aged_iso(seconds_old), "sourceFileId": source_file_id}
    _make_media_dir(settings.media_images_dir, image_id, meta, seconds_old=seconds_old)


OLD = ORPHAN_GRACE_SECONDS + 3600
RECENT = 60


def test_old_unreferenced_file_is_deleted(isolated_data, live_refs):
    file_id = str(uuid.uuid4())
    _make_file(file_id, seconds_old=OLD)

    sweep_orphan_media(dry_run=False)

    assert not (settings.media_files_dir / file_id).exists()


def test_recent_unreferenced_file_is_kept_within_grace_period(isolated_data, live_refs):
    file_id = str(uuid.uuid4())
    _make_file(file_id, seconds_old=RECENT)

    report = sweep_orphan_media(dry_run=False)

    assert file_id not in report.file_ids
    assert (settings.media_files_dir / file_id).exists()


def test_referenced_file_is_kept_even_when_old(isolated_data, live_refs):
    file_id = str(uuid.uuid4())
    _make_file(file_id, seconds_old=OLD)
    live_refs.add(file_id)

    sweep_orphan_media(dry_run=False)

    assert (settings.media_files_dir / file_id).exists()


def test_old_unreferenced_image_is_deleted_and_live_image_kept(isolated_data, live_refs):
    orphan_image = str(uuid.uuid4())
    live_image = str(uuid.uuid4())
    _make_image(orphan_image, None, seconds_old=OLD)
    _make_image(live_image, None, seconds_old=OLD)
    live_refs.add(live_image)

    sweep_orphan_media(dry_run=False)

    assert not (settings.media_images_dir / orphan_image).exists()
    assert (settings.media_images_dir / live_image).exists()


def test_source_file_is_protected_while_a_derived_image_is_live(isolated_data, live_refs):
    source_file = str(uuid.uuid4())
    derived_image = str(uuid.uuid4())
    _make_file(source_file, seconds_old=OLD)
    _make_image(derived_image, source_file, seconds_old=OLD)
    live_refs.add(derived_image)

    sweep_orphan_media(dry_run=False)

    assert (settings.media_files_dir / source_file).exists()
    assert (settings.media_images_dir / derived_image).exists()


def test_source_file_is_protected_while_derived_image_is_within_grace(isolated_data, live_refs):
    source_file = str(uuid.uuid4())
    derived_image = str(uuid.uuid4())
    _make_file(source_file, seconds_old=OLD)
    _make_image(derived_image, source_file, seconds_old=RECENT)

    sweep_orphan_media(dry_run=False)

    assert (settings.media_files_dir / source_file).exists()
    assert (settings.media_images_dir / derived_image).exists()


def test_source_file_is_released_once_its_orphan_image_is_swept(isolated_data, live_refs):
    source_file = str(uuid.uuid4())
    derived_image = str(uuid.uuid4())
    _make_file(source_file, seconds_old=OLD)
    _make_image(derived_image, source_file, seconds_old=OLD)

    sweep_orphan_media(dry_run=False)

    assert not (settings.media_images_dir / derived_image).exists()
    assert not (settings.media_files_dir / source_file).exists()


def test_dry_run_reports_candidates_without_deleting(isolated_data, live_refs, monkeypatch):
    monkeypatch.setattr(settings, "media_gc_dry_run", True)
    file_id = str(uuid.uuid4())
    image_id = str(uuid.uuid4())
    _make_file(file_id, seconds_old=OLD)
    _make_image(image_id, None, seconds_old=OLD)

    report = sweep_orphan_media(dry_run=True)

    assert report.file_ids == [file_id]
    assert report.image_ids == [image_id]
    assert (settings.media_files_dir / file_id).exists()
    assert (settings.media_images_dir / image_id).exists()


def test_directory_without_meta_falls_back_to_mtime(isolated_data, live_refs):
    old_id = str(uuid.uuid4())
    recent_id = str(uuid.uuid4())
    _make_media_dir(settings.media_files_dir, old_id, None, seconds_old=OLD)
    _make_media_dir(settings.media_files_dir, recent_id, None, seconds_old=RECENT)

    sweep_orphan_media(dry_run=False)

    assert not (settings.media_files_dir / old_id).exists()
    assert (settings.media_files_dir / recent_id).exists()


def test_corrupt_meta_does_not_abort_the_sweep(isolated_data, live_refs):
    corrupt_id = str(uuid.uuid4())
    healthy_id = str(uuid.uuid4())
    corrupt_dir = settings.media_files_dir / corrupt_id
    corrupt_dir.mkdir(parents=True)
    (corrupt_dir / "meta.json").write_text("{not json", encoding="utf-8")
    stamp = (datetime.now(timezone.utc) - timedelta(seconds=OLD)).timestamp()
    os.utime(corrupt_dir, (stamp, stamp))
    _make_file(healthy_id, seconds_old=OLD)

    sweep_orphan_media(dry_run=False)

    assert not (settings.media_files_dir / corrupt_id).exists()
    assert not (settings.media_files_dir / healthy_id).exists()


def test_non_uuid_directories_are_never_touched(isolated_data, live_refs):
    stray = settings.media_files_dir / "keep-me"
    stray.mkdir(parents=True)
    stamp = (datetime.now(timezone.utc) - timedelta(seconds=OLD)).timestamp()
    os.utime(stray, (stamp, stamp))

    sweep_orphan_media(dry_run=False)

    assert stray.exists()


def test_run_maintenance_purges_expired_post_trash(isolated_data, live_refs):
    expired = {
        "id": str(uuid.uuid4()),
        "deletedAt": (datetime.now(timezone.utc) - timedelta(days=31)).isoformat(),
        "deletedBy": "admin@example.com",
        "post": {"id": str(uuid.uuid4()), "createdBy": "admin@example.com", "images": [], "copies": {}},
    }
    settings.posts_trash_file.write_text(json.dumps({"items": [expired]}), encoding="utf-8")

    run_maintenance()

    assert expired["id"] not in settings.posts_trash_file.read_text(encoding="utf-8")


def test_run_maintenance_keeps_sweeping_when_a_step_fails(isolated_data, live_refs, monkeypatch):
    def broken_purge() -> None:
        raise RuntimeError("trash store unavailable")

    monkeypatch.setattr(maintenance_service.posts_trash_service, "purge_expired_trash", broken_purge)
    file_id = str(uuid.uuid4())
    _make_file(file_id, seconds_old=OLD)

    run_maintenance()

    assert not (settings.media_files_dir / file_id).exists()
