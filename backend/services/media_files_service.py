from __future__ import annotations

import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.config import settings
from core.json_store import write_json_store

ORIGINAL_BASENAME = "original"
META_FILENAME = "meta.json"
READ_CHUNK_SIZE = 64 * 1024

FILE_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
MEDIA_FILE_PATH_PREFIX = "/api/v1/media/files/"
_SAFE_EXT_RE = re.compile(r"^\.[a-z0-9]{1,16}$")

DEFAULT_CONTENT_TYPE = "application/octet-stream"
_MIME_TYPE_RE = re.compile(
    r"^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$"
)

# Only these types may be served inline from the public GET endpoint.
# Everything else is forced to a download as application/octet-stream.
INLINE_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "application/pdf",
    }
)

# Uploads of these types are rejected outright (script-capable on the API origin).
_REJECTED_UPLOAD_CONTENT_TYPES = frozenset(
    {
        "text/html",
        "application/xhtml+xml",
        "image/svg+xml",
        "text/javascript",
        "application/javascript",
        "application/x-javascript",
        "text/ecmascript",
        "application/ecmascript",
        "text/xml",
        "application/xml",
    }
)

_CONTENT_TYPE_ALIASES = {
    "image/jpg": "image/jpeg",
}


class MediaFilesError(Exception):
    pass


class MediaFilesNotFoundError(MediaFilesError):
    pass


class MediaFilesValidationError(MediaFilesError):
    pass


def normalize_uploader(email: str | None) -> str:
    return str(email or "").strip().lower()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_accept_tokens(accept: str | None) -> list[str]:
    if accept is None:
        return []
    tokens = [part.strip().lower() for part in accept.split(",")]
    return [token for token in tokens if token and token != "*"]


def normalize_content_type(content_type: str | None) -> str:
    """Return the bare lowercase MIME type; parameters (``; charset=...``) are dropped."""
    essence = (content_type or "").split(";", 1)[0].strip().lower()
    if not _MIME_TYPE_RE.fullmatch(essence):
        return DEFAULT_CONTENT_TYPE
    return _CONTENT_TYPE_ALIASES.get(essence, essence)


def content_type_matches_token(content_type: str, token: str) -> bool:
    normalized = normalize_content_type(content_type)
    if token.endswith("/*"):
        return normalized.startswith(token[:-1])
    return normalized == normalize_content_type(token)


def matches_accept(
    *, content_type: str, original_name: str, accept: str | None
) -> bool:
    tokens = _normalize_accept_tokens(accept)
    if not tokens:
        return True

    mime_tokens = [token for token in tokens if not token.startswith(".")]
    extension_tokens = [token for token in tokens if token.startswith(".")]
    name = (original_name or "").strip().lower()

    mime_ok = any(
        content_type_matches_token(content_type, token) for token in mime_tokens
    )
    ext_ok = any(name.endswith(token) for token in extension_tokens)

    if mime_tokens and extension_tokens:
        return mime_ok or ext_ok
    if mime_tokens:
        return mime_ok
    return ext_ok


def resolve_max_size_bytes(requested_max: int | None) -> int:
    configured = int(settings.media_max_file_bytes)
    if requested_max is None:
        return configured
    if requested_max <= 0:
        raise MediaFilesValidationError("max_size_bytes must be positive")
    return min(int(requested_max), configured)


def sniff_content_type(content: bytes) -> str | None:
    if len(content) >= 12 and content[4:8] == b"ftyp":
        return "video/mp4"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
        return "image/gif"
    if (
        len(content) >= 12
        and content.startswith(b"RIFF")
        and content[8:12] == b"WEBP"
    ):
        return "image/webp"
    if content.startswith(b"%PDF"):
        return "application/pdf"
    return None


def assert_content_type_plausible(content: bytes, content_type: str) -> None:
    """Reject dangerous types and MIME spoofing for sniffable formats."""
    normalized = normalize_content_type(content_type)
    if normalized in _REJECTED_UPLOAD_CONTENT_TYPES:
        raise MediaFilesValidationError("File type is not allowed")

    sniffed = sniff_content_type(content)
    sniffable = {
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "application/pdf",
        "video/mp4",
    }
    if normalized in sniffable:
        if sniffed != normalized:
            raise MediaFilesValidationError(
                "File content does not match declared type"
            )


def must_force_attachment(content_type: str) -> bool:
    return normalize_content_type(content_type) not in INLINE_CONTENT_TYPES


def served_content_type(content_type: str) -> str:
    """Media type for the response; non-inline types never reach the browser as-is."""
    normalized = normalize_content_type(content_type)
    return normalized if normalized in INLINE_CONTENT_TYPES else DEFAULT_CONTENT_TYPE


def _validate_file_id(file_id: str) -> str:
    value = (file_id or "").strip()
    if not FILE_ID_RE.match(value):
        raise MediaFilesNotFoundError("File not found")
    return value.lower()


def _meta_path(file_dir: Path) -> Path:
    return file_dir / META_FILENAME


def stored_name_for(original_name: str) -> str:
    """Keep a stable basename plus a safe extension so files open in Explorer."""
    suffix = Path(original_name or "").suffix.lower()
    if suffix and _SAFE_EXT_RE.match(suffix):
        return f"{ORIGINAL_BASENAME}{suffix}"
    return ORIGINAL_BASENAME


def normalize_original_name(name: str) -> str:
    """Sanitize upload filename and collapse duplicated extensions (.pdf.pdf)."""
    cleaned = Path((name or "").strip() or "file").name
    while True:
        path = Path(cleaned)
        suffix = path.suffix.lower()
        if not suffix or not _SAFE_EXT_RE.match(suffix):
            break
        stem = path.stem
        if not stem.lower().endswith(suffix):
            break
        cleaned = stem
    return cleaned or "file"


def _resolve_original_path(file_dir: Path, meta: dict[str, Any]) -> Path:
    stored = str(meta.get("storedName") or "").strip()
    if stored and stored not in {".", ".."} and "/" not in stored and "\\" not in stored:
        candidate = file_dir / stored
        if candidate.is_file():
            return candidate
    legacy = file_dir / ORIGINAL_BASENAME
    if legacy.is_file():
        return legacy
    matches = sorted(file_dir.glob(f"{ORIGINAL_BASENAME}.*"))
    if matches:
        return matches[0]
    raise MediaFilesNotFoundError("File not found")


def _read_meta(file_dir: Path) -> dict[str, Any]:
    path = _meta_path(file_dir)
    if not path.is_file():
        raise MediaFilesNotFoundError("File not found")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MediaFilesError("Corrupt media metadata") from error
    if not isinstance(payload, dict):
        raise MediaFilesError("Corrupt media metadata")
    return payload


def _to_response(meta: dict[str, Any]) -> dict[str, Any]:
    file_id = str(meta["id"])
    return {
        "id": file_id,
        "url": f"{MEDIA_FILE_PATH_PREFIX}{file_id}",
        "originalName": str(meta.get("originalName") or ""),
        "contentType": str(meta.get("contentType") or "application/octet-stream"),
        "sizeBytes": int(meta.get("sizeBytes") or 0),
    }


async def read_upload_limited(upload_file: Any, limit: int) -> bytes:
    """Read multipart upload in chunks; stop once the size cap is exceeded."""
    if limit <= 0:
        raise MediaFilesValidationError("max_size_bytes must be positive")
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload_file.read(READ_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise MediaFilesValidationError(
                f"File exceeds maximum size of {limit} bytes"
            )
        chunks.append(chunk)
    return b"".join(chunks)


def save_file(
    content: bytes,
    *,
    original_name: str,
    content_type: str | None,
    max_size_bytes: int | None = None,
    accept: str | None = None,
    uploaded_by: str | None = None,
) -> dict[str, Any]:
    limit = resolve_max_size_bytes(max_size_bytes)
    size = len(content)
    if size > limit:
        raise MediaFilesValidationError(
            f"File exceeds maximum size of {limit} bytes"
        )

    normalized_type = normalize_content_type(content_type)
    if normalized_type == DEFAULT_CONTENT_TYPE and sniff_content_type(content) == "video/mp4":
        normalized_type = "video/mp4"
    name = normalize_original_name(original_name)
    assert_content_type_plausible(content, normalized_type)
    if not matches_accept(
        content_type=normalized_type, original_name=name, accept=accept
    ):
        raise MediaFilesValidationError("File type is not allowed")

    file_id = str(uuid.uuid4())
    file_dir = settings.media_file_dir(file_id)
    file_dir.mkdir(parents=True, exist_ok=False)
    stored_name = stored_name_for(name)

    try:
        (file_dir / stored_name).write_bytes(content)
        meta = {
            "id": file_id,
            "originalName": name,
            "storedName": stored_name,
            "contentType": normalized_type,
            "sizeBytes": size,
            "uploadedBy": normalize_uploader(uploaded_by),
            "createdAt": _utc_now_iso(),
        }
        write_json_store(_meta_path(file_dir), meta)
    except OSError:
        shutil.rmtree(file_dir, ignore_errors=True)
        raise

    return _to_response(meta)


def get_file_record(file_id: str) -> dict[str, Any]:
    validated_id = _validate_file_id(file_id)
    file_dir = settings.media_file_dir(validated_id)
    if not file_dir.is_dir():
        raise MediaFilesNotFoundError("File not found")
    meta = _read_meta(file_dir)
    original = _resolve_original_path(file_dir, meta)
    return {
        "meta": meta,
        "path": original,
        "response": _to_response(meta),
    }


def delete_file(file_id: str) -> None:
    validated_id = _validate_file_id(file_id)
    file_dir = settings.media_file_dir(validated_id)
    if not file_dir.is_dir():
        raise MediaFilesNotFoundError("File not found")
    shutil.rmtree(file_dir)
