from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import shutil
import stat
import tempfile
import threading
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Any

from core.config import settings
from core.store_lock import STORE_LOCK

logger = logging.getLogger(__name__)

MAX_BACKUPS = 12
MAX_ARCHIVE_FILES = 10_000
IMPORT_RETENTION = timedelta(hours=2)
MANIFEST_NAME = "manifest.json"
_BACKUP_ID_RE = re.compile(
    r"^\d{8}T\d{6}Z-(automatic|manual|pre_restore)-[0-9a-f]{32}$"
)
_IMPORT_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_CHUNK_SIZE = 64 * 1024


class BackupError(Exception):
    pass


class BackupNotFoundError(BackupError):
    pass


class BackupValidationError(BackupError):
    pass


class BackupPasswordError(BackupError):
    pass


class BackupPasswordNotConfiguredError(BackupError):
    pass


class BackupCancelledError(BackupError):
    pass


class BackupSiteMismatchError(BackupValidationError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _backup_root() -> Path:
    root = settings.backup_dir.resolve()
    data_dir = settings.data_dir.resolve()
    if root == data_dir or data_dir in root.parents:
        raise BackupValidationError("Backup storage must be outside the data directory")
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o700)
    return root


def _imports_root() -> Path:
    root = _backup_root() / ".imports"
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o700)
    return root


def _backup_path(backup_id: str) -> Path:
    if not _BACKUP_ID_RE.fullmatch(backup_id):
        raise BackupNotFoundError("Backup not found")
    path = _backup_root() / f"{backup_id}.zip"
    if not path.is_file():
        raise BackupNotFoundError("Backup not found")
    return path


def _import_path(import_id: str) -> Path:
    if not _IMPORT_ID_RE.fullmatch(import_id):
        raise BackupNotFoundError("Import not found")
    path = _imports_root() / f"{import_id}.zip"
    if not path.is_file():
        raise BackupNotFoundError("Import not found")
    return path


def _archive_names() -> list[Path]:
    return sorted(
        (
            path
            for path in _backup_root().glob("*.zip")
            if _BACKUP_ID_RE.fullmatch(path.stem)
        ),
        key=lambda path: (path.stat().st_mtime_ns, path.name),
    )


def _prune_backups(preserve: Path | None = None) -> None:
    archives = _archive_names()
    excess = max(0, len(archives) - MAX_BACKUPS)
    preserved_path = preserve.resolve() if preserve is not None else None
    for path in archives:
        if excess == 0:
            break
        if preserved_path is not None and path.resolve() == preserved_path:
            continue
        path.unlink()
        excess -= 1


def _manifest_for(path: Path) -> dict[str, Any]:
    manifest, _ = _validate_archive(path)
    return manifest


def _backup_metadata(path: Path) -> dict[str, Any]:
    backup_id = path.stem
    kind = backup_id.split("-")[1]
    try:
        manifest = _manifest_for(path)
        created_at = manifest.get("createdAt")
        is_valid = (
            manifest.get("schemaVersion") == 1
            and manifest.get("siteId") == settings.jwt_issuer
            and manifest.get("kind") == kind
            and isinstance(created_at, str)
            and isinstance(manifest.get("files"), list)
        )
        if not isinstance(created_at, str):
            created_at = ""
        else:
            try:
                datetime.fromisoformat(created_at)
            except ValueError:
                is_valid = False
    except BackupValidationError:
        created_at = ""
        is_valid = False
    return {
        "id": backup_id,
        "kind": kind,
        "createdAt": created_at,
        "sizeBytes": path.stat().st_size,
        "isValid": is_valid,
    }


def list_backups() -> dict[str, Any]:
    with STORE_LOCK:
        backups = [_backup_metadata(path) for path in _archive_names()]
    backups.sort(key=lambda item: (item["createdAt"], item["id"]), reverse=True)
    return {"backups": backups, "maxBackups": MAX_BACKUPS}


def _raise_if_cancelled(cancel_event: threading.Event | None) -> None:
    if cancel_event is not None and cancel_event.is_set():
        raise BackupCancelledError("Backup was cancelled")


def _iter_data_files(
    cancel_event: threading.Event | None = None,
) -> list[Path]:
    data_dir = settings.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for path in data_dir.rglob("*"):
        _raise_if_cancelled(cancel_event)
        if path.is_symlink():
            raise BackupValidationError("Symbolic links are not supported in data")
        if not path.is_file():
            continue
        if path.relative_to(data_dir) == Path("verification_codes.json"):
            continue
        paths.append(path)
    paths.sort()
    if len(paths) > MAX_ARCHIVE_FILES:
        raise BackupValidationError("Data contains too many files to back up")
    return paths


def _create_backup_locked(
    kind: str,
    created_at: datetime | None = None,
    preserve_backup: Path | None = None,
    cancel_event: threading.Event | None = None,
) -> dict[str, Any]:
    _raise_if_cancelled(cancel_event)
    now = (created_at or _utc_now()).astimezone(timezone.utc).replace(microsecond=0)
    backup_id = f"{now.strftime('%Y%m%dT%H%M%SZ')}-{kind}-{uuid.uuid4().hex}"
    root = _backup_root()
    final_path = root / f"{backup_id}.zip"
    fd, temporary_name = tempfile.mkstemp(
        prefix=".backup-", suffix=".tmp", dir=root
    )
    os.close(fd)
    temporary_path = Path(temporary_name)
    files: list[dict[str, Any]] = []
    total_size = 0
    try:
        with zipfile.ZipFile(
            temporary_path,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
        ) as archive:
            for source in _iter_data_files(cancel_event):
                _raise_if_cancelled(cancel_event)
                relative_path = source.relative_to(settings.data_dir).as_posix()
                archive_name = f"data/{relative_path}"
                digest = hashlib.sha256()
                size = 0
                with source.open("rb") as source_file:
                    with archive.open(archive_name, "w") as archive_file:
                        while chunk := source_file.read(_CHUNK_SIZE):
                            _raise_if_cancelled(cancel_event)
                            size += len(chunk)
                            total_size += len(chunk)
                            if total_size > settings.backup_max_expanded_bytes:
                                raise BackupValidationError(
                                    "Data exceeds the backup expanded size limit"
                                )
                            digest.update(chunk)
                            archive_file.write(chunk)
                files.append(
                    {
                        "path": archive_name,
                        "sizeBytes": size,
                        "sha256": digest.hexdigest(),
                    }
                )
            _raise_if_cancelled(cancel_event)
            manifest = {
                "schemaVersion": 1,
                "siteId": settings.jwt_issuer,
                "createdAt": now.isoformat(),
                "kind": kind,
                "files": files,
            }
            archive.writestr(
                MANIFEST_NAME,
                json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
            )
        _raise_if_cancelled(cancel_event)
        if temporary_path.stat().st_size > settings.backup_max_archive_bytes:
            raise BackupValidationError("Backup archive exceeds the size limit")
        with temporary_path.open("rb+") as archive_file:
            os.fsync(archive_file.fileno())
        _raise_if_cancelled(cancel_event)
        os.replace(temporary_path, final_path)
        _prune_backups(preserve_backup)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    return _backup_metadata(final_path)


def create_backup(
    kind: str = "manual",
    cancel_event: threading.Event | None = None,
) -> dict[str, Any]:
    if kind not in {"automatic", "manual", "pre_restore"}:
        raise ValueError("Unsupported backup kind")
    with STORE_LOCK:
        return _create_backup_locked(kind, cancel_event=cancel_event)


def ensure_monthly_backup(now: datetime | None = None) -> None:
    current = (now or _utc_now()).astimezone(timezone.utc)
    month_prefix = current.strftime("%Y%m")
    with STORE_LOCK:
        for path in _archive_names():
            if (
                path.stem.startswith(month_prefix)
                and "-automatic-" in path.stem
                and _backup_metadata(path)["isValid"]
            ):
                return
        _create_backup_locked("automatic", current)


def get_backup_file(backup_id: str) -> Path:
    return _backup_path(backup_id)


def _require_password(password: str) -> None:
    configured = settings.backup_password
    if not configured:
        raise BackupPasswordNotConfiguredError(
            "Backup password is not configured on the server"
        )
    if not hmac.compare_digest(
        configured.encode("utf-8"), password.encode("utf-8")
    ):
        raise BackupPasswordError("Backup password is incorrect")


def delete_backup(backup_id: str, password: str) -> None:
    _require_password(password)
    with STORE_LOCK:
        _backup_path(backup_id).unlink()


def _safe_archive_member(info: zipfile.ZipInfo) -> str:
    name = info.filename
    if (
        not name
        or "\\" in name
        or "\x00" in name
        or name.endswith("/")
        or PurePosixPath(name).as_posix() != name
        or info.flag_bits & 0x1
    ):
        raise BackupValidationError("Backup contains an unsafe archive path")
    path = PurePosixPath(name)
    if path.is_absolute() or any(
        part in {"", ".", ".."} or ":" in part for part in path.parts
    ):
        raise BackupValidationError("Backup contains an unsafe archive path")
    if path.parts[0] != "data" or len(path.parts) < 2:
        raise BackupValidationError("Backup contains an unexpected file")
    if path.parts[1:] == ("verification_codes.json",):
        raise BackupValidationError("Backup must not contain verification codes")
    mode = info.external_attr >> 16
    if stat.S_ISLNK(mode) or info.is_dir():
        raise BackupValidationError("Backup contains an unsupported file type")
    return name


def _validate_archive(path: Path) -> tuple[dict[str, Any], int]:
    if path.stat().st_size > settings.backup_max_archive_bytes:
        raise BackupValidationError("Backup archive exceeds the upload size limit")
    try:
        with zipfile.ZipFile(path, "r") as archive:
            infos = archive.infolist()
            if len(infos) < 1 or len(infos) > MAX_ARCHIVE_FILES + 1:
                raise BackupValidationError("Backup contains an invalid number of files")
            names = [info.filename for info in infos]
            if len(names) != len(set(names)) or MANIFEST_NAME not in names:
                raise BackupValidationError("Backup archive structure is invalid")
            file_infos: dict[str, zipfile.ZipInfo] = {}
            expanded_size = 0
            for info in infos:
                if info.filename == MANIFEST_NAME:
                    if info.file_size > 2 * 1024 * 1024:
                        raise BackupValidationError("Backup manifest is too large")
                    mode = info.external_attr >> 16
                    if (
                        info.flag_bits & 0x1
                        or stat.S_ISLNK(mode)
                        or info.is_dir()
                    ):
                        raise BackupValidationError(
                            "Backup contains an unsupported file type"
                        )
                    continue
                member_name = _safe_archive_member(info)
                expanded_size += info.file_size
                if expanded_size > settings.backup_max_expanded_bytes:
                    raise BackupValidationError("Backup expands beyond the size limit")
                file_infos[member_name] = info
            manifest = json.loads(archive.read(MANIFEST_NAME))
            if not isinstance(manifest, dict):
                raise BackupValidationError("Backup manifest is invalid")
            if (
                type(manifest.get("schemaVersion")) is not int
                or manifest["schemaVersion"] != 1
            ):
                raise BackupValidationError("Backup version is not supported")
            if manifest.get("siteId") != settings.jwt_issuer:
                raise BackupSiteMismatchError("Backup belongs to a different site")
            if not isinstance(manifest.get("createdAt"), str):
                raise BackupValidationError("Backup creation time is missing")
            try:
                datetime.fromisoformat(manifest["createdAt"])
            except ValueError as error:
                raise BackupValidationError("Backup creation time is invalid") from error
            if manifest.get("kind") not in {"automatic", "manual", "pre_restore"}:
                raise BackupValidationError("Backup kind is invalid")
            files = manifest.get("files")
            if not isinstance(files, list) or len(files) != len(file_infos):
                raise BackupValidationError("Backup file manifest does not match")
            expected: dict[str, dict[str, Any]] = {}
            for record in files:
                if not isinstance(record, dict):
                    raise BackupValidationError("Backup file manifest is invalid")
                member_name = record.get("path")
                size = record.get("sizeBytes")
                digest = record.get("sha256")
                if (
                    not isinstance(member_name, str)
                    or member_name in expected
                    or member_name not in file_infos
                    or type(size) is not int
                    or size < 0
                    or not isinstance(digest, str)
                    or not re.fullmatch(r"[0-9a-f]{64}", digest)
                    or file_infos[member_name].file_size != size
                ):
                    raise BackupValidationError("Backup file manifest is invalid")
                expected[member_name] = record
            if set(expected) != set(file_infos):
                raise BackupValidationError("Backup file manifest does not match")
            total_actual_size = 0
            for member_name, info in file_infos.items():
                digest = hashlib.sha256()
                member_size = 0
                with archive.open(info, "r") as member:
                    while chunk := member.read(_CHUNK_SIZE):
                        member_size += len(chunk)
                        total_actual_size += len(chunk)
                        if (
                            member_size > info.file_size
                            or total_actual_size
                            > settings.backup_max_expanded_bytes
                        ):
                            raise BackupValidationError(
                                "Backup expands beyond the size limit"
                            )
                        digest.update(chunk)
                if member_size != info.file_size:
                    raise BackupValidationError("Backup file size does not match")
                if not hmac.compare_digest(
                    digest.hexdigest(), expected[member_name]["sha256"]
                ):
                    raise BackupValidationError("Backup file integrity check failed")
    except BackupError:
        raise
    except (
        OSError,
        zipfile.BadZipFile,
        RuntimeError,
        NotImplementedError,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ) as error:
        raise BackupValidationError("Backup archive is damaged or invalid") from error
    return manifest, expanded_size


def _copy_upload(source: BinaryIO, destination: Path) -> None:
    source.seek(0)
    size = 0
    try:
        with destination.open("xb") as target:
            destination.chmod(0o600)
            while chunk := source.read(_CHUNK_SIZE):
                size += len(chunk)
                if size > settings.backup_max_archive_bytes:
                    raise BackupValidationError(
                        "Backup archive exceeds the upload size limit"
                    )
                target.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def stage_import(source: BinaryIO) -> dict[str, Any]:
    imports_dir = _imports_root()
    import_id = uuid.uuid4().hex
    destination = imports_dir / f"{import_id}.zip"
    _copy_upload(source, destination)
    try:
        manifest, expanded_size = _validate_archive(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return {
        "importId": import_id,
        "createdAt": manifest["createdAt"],
        "siteId": manifest["siteId"],
        "fileCount": len(manifest["files"]),
        "expandedSizeBytes": expanded_size,
    }


def _extract_archive(path: Path, destination: Path) -> None:
    manifest, _ = _validate_archive(path)
    destination.mkdir(parents=True, exist_ok=False)
    try:
        with zipfile.ZipFile(path, "r") as archive:
            records = {record["path"]: record for record in manifest["files"]}
            total_size = 0
            for member_name, record in records.items():
                relative = PurePosixPath(member_name).relative_to("data")
                target = destination.joinpath(*relative.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                size = 0
                with archive.open(member_name, "r") as source:
                    with target.open("xb") as output:
                        while chunk := source.read(_CHUNK_SIZE):
                            size += len(chunk)
                            total_size += len(chunk)
                            if (
                                size > record["sizeBytes"]
                                or total_size
                                > settings.backup_max_expanded_bytes
                            ):
                                raise BackupValidationError(
                                    "Backup expands beyond the size limit"
                                )
                            digest.update(chunk)
                            output.write(chunk)
                if (
                    size != record["sizeBytes"]
                    or not hmac.compare_digest(
                        digest.hexdigest(), record["sha256"]
                    )
                ):
                    raise BackupValidationError(
                        "Backup integrity check failed during restore"
                    )
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise


def _restore_archive(path: Path) -> dict[str, Any]:
    with STORE_LOCK:
        _validate_archive(path)
        preserve_backup = (
            path
            if path.parent.resolve() == _backup_root().resolve()
            else None
        )
        safety_backup = _create_backup_locked(
            "pre_restore", preserve_backup=preserve_backup
        )
        base_path = settings.base_path
        base_path.mkdir(parents=True, exist_ok=True)
        staged_data = base_path / f".data-restore-{uuid.uuid4().hex}"
        previous_data = base_path / f".data-before-restore-{uuid.uuid4().hex}"
        _extract_archive(path, staged_data)
        data_dir = settings.data_dir
        if not data_dir.exists():
            data_dir.mkdir(parents=True)
        try:
            os.replace(data_dir, previous_data)
            os.replace(staged_data, data_dir)
        except Exception:
            if previous_data.exists() and not data_dir.exists():
                os.replace(previous_data, data_dir)
            shutil.rmtree(staged_data, ignore_errors=True)
            raise
        try:
            shutil.rmtree(previous_data)
        except OSError:
            logger.exception("Restored data but could not remove previous data directory")
        return {"restored": True, "safetyBackupId": safety_backup["id"]}


def restore_backup(backup_id: str, password: str) -> dict[str, Any]:
    _require_password(password)
    with STORE_LOCK:
        return _restore_archive(_backup_path(backup_id))


def restore_import(import_id: str, password: str) -> dict[str, Any]:
    _require_password(password)
    with STORE_LOCK:
        path = _import_path(import_id)
        result = _restore_archive(path)
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Restored import but could not remove staged archive")
        return result


def purge_expired_imports(now: datetime | None = None) -> None:
    current = now or _utc_now()
    with STORE_LOCK:
        imports_dir = _imports_root()
        for path in imports_dir.glob("*.zip"):
            if not _IMPORT_ID_RE.fullmatch(path.stem):
                continue
            modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            if current - modified >= IMPORT_RETENTION:
                path.unlink()
