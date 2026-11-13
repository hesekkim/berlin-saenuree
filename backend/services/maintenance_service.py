"""Scheduled maintenance: trash expiry and orphan media sweep.

Runs inside the app process so it shares the store locks with request handling.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from starlette.concurrency import run_in_threadpool

from core.config import settings
from core.json_store import JsonStoreCorruptError, read_json_store
from core.store_lock import STORE_LOCK
from services import backups_service, blogger_trash_service, posts_trash_service
from services.image_optimize_service import (
    ImageOptimizeNotFoundError,
    delete_derivatives,
)
from services.media_files_service import (
    META_FILENAME,
    MediaFilesNotFoundError,
    VIDEO_UPLOAD_TEMP_PREFIX,
    delete_file,
)
from services.media_refs import collect_active_media_refs, normalize_media_id

logger = logging.getLogger(__name__)

FIRST_RUN_DELAY_SECONDS = 5 * 60
RUN_INTERVAL_SECONDS = 6 * 60 * 60
ORPHAN_GRACE_SECONDS = 24 * 60 * 60
VIDEO_UPLOAD_TEMP_GRACE_SECONDS = 24 * 60 * 60


@dataclass
class OrphanReport:
    image_ids: list[str] = field(default_factory=list)
    file_ids: list[str] = field(default_factory=list)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def _media_directories(root: Path) -> dict[str, Path]:
    if not root.is_dir():
        return {}
    return {
        item.name.lower(): item
        for item in root.iterdir()
        if item.is_dir() and _is_uuid(item.name)
    }


def _read_meta(directory: Path) -> dict[str, Any] | None:
    try:
        payload = read_json_store(directory / META_FILENAME)
    except JsonStoreCorruptError:
        return None
    return payload if isinstance(payload, dict) else None


def _parse_timestamp(value: object) -> float | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _created_at(directory: Path, meta: dict[str, Any] | None) -> float:
    """Creation time from meta, falling back to the directory mtime when meta is unusable."""
    if meta is not None:
        created = _parse_timestamp(meta.get("createdAt"))
        if created is not None:
            return created
    return directory.stat().st_mtime


def _is_past_grace(created_at: float, now: float) -> bool:
    return now - created_at >= ORPHAN_GRACE_SECONDS


def _delete_image(image_id: str) -> None:
    try:
        delete_derivatives(image_id)
    except (ImageOptimizeNotFoundError, OSError) as error:
        logger.warning("Orphan sweep could not delete image %s: %s", image_id, error)


def _delete_file(file_id: str) -> None:
    try:
        delete_file(file_id)
    except (MediaFilesNotFoundError, OSError) as error:
        logger.warning("Orphan sweep could not delete file %s: %s", file_id, error)


def cleanup_stale_video_uploads(*, now: float | None = None) -> int:
    root = settings.media_upload_temp_dir
    current = time.time() if now is None else now
    removed = 0
    for path in root.iterdir():
        if (
            not path.name.startswith(VIDEO_UPLOAD_TEMP_PREFIX)
            or path.is_symlink()
            or not path.is_dir()
        ):
            continue
        try:
            last_modified = path.stat().st_mtime
            source_path = path / "source.mp4"
            if source_path.is_file():
                last_modified = max(last_modified, source_path.stat().st_mtime)
            if current - last_modified < VIDEO_UPLOAD_TEMP_GRACE_SECONDS:
                continue
            shutil.rmtree(path)
            removed += 1
        except FileNotFoundError:
            continue
        except OSError as error:
            logger.warning(
                "Could not remove stale video upload directory %s: %s",
                path.name,
                error,
            )
    return removed


def sweep_orphan_media(*, dry_run: bool, now: float | None = None) -> OrphanReport:
    """Delete unreferenced media older than the grace period, or only report it.

    References are read and deletions happen under the store lock, so a save
    cannot start referencing a candidate between the check and the delete.
    A file is kept while any image derived from it is live or still within the
    grace period, because that image may still be published or edited.
    """
    current = time.time() if now is None else now
    with STORE_LOCK:
        live = collect_active_media_refs()

        image_dirs = _media_directories(settings.media_images_dir)
        image_metas = {image_id: _read_meta(path) for image_id, path in image_dirs.items()}
        orphan_images = [
            image_id
            for image_id, path in image_dirs.items()
            if image_id not in live
            and _is_past_grace(_created_at(path, image_metas[image_id]), current)
        ]

        protected = set(live)
        for image_id in image_dirs:
            if image_id in orphan_images:
                continue
            meta = image_metas[image_id] or {}
            source = meta.get("sourceFileId")
            if source:
                protected.add(normalize_media_id(str(source)))

        file_dirs = _media_directories(settings.media_files_dir)
        orphan_files = [
            file_id
            for file_id, path in file_dirs.items()
            if file_id not in protected
            and _is_past_grace(_created_at(path, _read_meta(path)), current)
        ]

        report = OrphanReport(image_ids=orphan_images, file_ids=orphan_files)
        if dry_run:
            return report

        for image_id in orphan_images:
            _delete_image(image_id)
        for file_id in orphan_files:
            _delete_file(file_id)
        return report


def _run_step(name: str, step: Callable[[], object]) -> None:
    try:
        step()
    except Exception:
        logger.exception("Maintenance step failed: %s", name)


def _sweep_orphans() -> None:
    dry_run = settings.media_gc_dry_run
    report = sweep_orphan_media(dry_run=dry_run)
    if dry_run:
        logger.info(
            "Orphan media dry run: %d image(s), %d file(s) would be deleted: images=%s files=%s",
            len(report.image_ids),
            len(report.file_ids),
            report.image_ids,
            report.file_ids,
        )
    else:
        logger.info(
            "Orphan media sweep deleted %d image(s), %d file(s)",
            len(report.image_ids),
            len(report.file_ids),
        )


def _cleanup_stale_video_uploads() -> None:
    removed = cleanup_stale_video_uploads()
    if removed:
        logger.info("Removed %d stale video upload directory(s)", removed)


def run_maintenance() -> None:
    """One maintenance pass. Each step is isolated so a failure does not skip the rest."""
    _run_step("posts trash expiry", posts_trash_service.purge_expired_trash)
    _run_step("blogger trash expiry", blogger_trash_service.purge_expired_trash)
    _run_step("stale video upload cleanup", _cleanup_stale_video_uploads)
    _run_step("orphan media sweep", _sweep_orphans)
    if settings.maintenance_enabled:
        _run_step("monthly backup", backups_service.ensure_monthly_backup)
        _run_step("expired backup imports", backups_service.purge_expired_imports)


async def maintenance_loop() -> None:
    await asyncio.sleep(FIRST_RUN_DELAY_SECONDS)
    while True:
        await run_in_threadpool(run_maintenance)
        await asyncio.sleep(RUN_INTERVAL_SECONDS)
