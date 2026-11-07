from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
import warnings
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable, Literal

from PIL import Image, ImageOps, UnidentifiedImageError

from core.config import settings
from core.json_store import JsonStoreCorruptError, read_json_store, write_json_store
from services.media_files_service import (
    META_FILENAME,
    MediaFilesNotFoundError,
    get_file_record,
    normalize_content_type,
    normalize_uploader,
    sniff_content_type,
)

_SOURCE_INDEX_LOCK = threading.Lock()
DERIVED_IMAGE_IDS_KEY = "derivedImageIds"
DISPLAY_FILENAME = "display.webp"
THUMB_FILENAME = "thumb.webp"

DISPLAY_MAX_EDGE = 1920
THUMB_MAX_EDGE = 400
WEBP_QUALITY = 85
# Pillow WebP effort 0-6. 4 keeps quality at 85 while encoding far faster than 6.
WEBP_METHOD = 4
PUBLISH_MIN_WIDTH = 32
PUBLISH_MAX_WIDTH = 1200
# Cap decode size (~25MP) to limit memory DoS from crafted images.
MAX_SOURCE_PIXELS = 25_000_000

_IMAGE_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

_ALLOWED_MIME = frozenset({"image/jpeg", "image/png", "image/webp"})
_ALLOWED_PIL_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})

ImageVariant = Literal["display", "thumb"]
IMAGE_VARIANTS: tuple[ImageVariant, ...] = ("display", "thumb")

Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS


class ImageOptimizeError(Exception):
    pass


class ImageOptimizeNotFoundError(ImageOptimizeError):
    pass


class ImageOptimizeValidationError(ImageOptimizeError):
    pass


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _validate_image_id(image_id: str) -> str:
    value = (image_id or "").strip()
    if not _IMAGE_ID_RE.match(value):
        raise ImageOptimizeNotFoundError("Image not found")
    return value.lower()


def _meta_path(image_dir: Path) -> Path:
    return image_dir / META_FILENAME


def _variant_path(image_dir: Path, variant: ImageVariant) -> Path:
    if variant == "display":
        return image_dir / DISPLAY_FILENAME
    return image_dir / THUMB_FILENAME


def _read_meta(image_dir: Path) -> dict[str, Any]:
    path = _meta_path(image_dir)
    if not path.is_file():
        raise ImageOptimizeNotFoundError("Image not found")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ImageOptimizeError("Corrupt image metadata") from error
    if not isinstance(payload, dict):
        raise ImageOptimizeError("Corrupt image metadata")
    return payload


def _generated_variants(meta: dict[str, Any]) -> list[ImageVariant]:
    raw_variants = meta.get("variants")
    if not isinstance(raw_variants, list):
        return ["display", "thumb"]
    return [variant for variant in IMAGE_VARIANTS if variant in raw_variants]


def _to_response(meta: dict[str, Any]) -> dict[str, Any]:
    image_id = str(meta["id"])
    variants = _generated_variants(meta)
    return {
        "imageId": image_id,
        "sourceFileId": str(meta.get("sourceFileId") or ""),
        "displayUrl": f"/api/v1/media/images/{image_id}/display",
        "thumbUrl": (
            f"/api/v1/media/images/{image_id}/thumb"
            if "thumb" in variants
            else None
        ),
        "variants": variants,
        "width": int(meta.get("width") or 0),
        "height": int(meta.get("height") or 0),
    }


def _normalize_variants(variants: Iterable[str] | None) -> tuple[ImageVariant, ...]:
    requested = ("display",) if variants is None else tuple(variants)
    if (
        not requested
        or "display" not in requested
        or any(variant not in IMAGE_VARIANTS for variant in requested)
    ):
        raise ImageOptimizeValidationError(
            "variants must contain display and may include thumb"
        )
    return tuple(variant for variant in IMAGE_VARIANTS if variant in requested)


def _prepare_rgb(image: Image.Image) -> Image.Image:
    if image.mode in {"RGB", "RGBA"}:
        return image
    if image.mode == "P":
        return image.convert("RGBA" if "transparency" in image.info else "RGB")
    if image.mode in {"LA", "L"}:
        return image.convert("RGBA" if image.mode == "LA" else "RGB")
    return image.convert("RGB")


def _resize_long_edge(image: Image.Image, max_edge: int) -> Image.Image:
    width, height = image.size
    long_edge = max(width, height)
    if long_edge <= max_edge:
        return image
    scale = max_edge / long_edge
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def _encode_webp(image: Image.Image, *, quality: int = WEBP_QUALITY) -> bytes:
    prepared = _prepare_rgb(image)
    buffer = BytesIO()
    prepared.save(buffer, format="WEBP", quality=quality, method=WEBP_METHOD)
    return buffer.getvalue()


def _assert_allowed_source(*, content: bytes, content_type: str | None) -> None:
    normalized = normalize_content_type(content_type)
    sniffed = sniff_content_type(content)
    if sniffed == "image/gif" or normalized == "image/gif":
        raise ImageOptimizeValidationError("Animated or GIF images are not allowed")
    if normalized not in _ALLOWED_MIME:
        raise ImageOptimizeValidationError("Only jpeg, png, and webp images are allowed")
    if sniffed is not None and sniffed not in _ALLOWED_MIME:
        raise ImageOptimizeValidationError("Only jpeg, png, and webp images are allowed")
    if sniffed is not None and sniffed != normalized:
        raise ImageOptimizeValidationError(
            "File content does not match declared type"
        )


def _open_source_image(content: bytes) -> Image.Image:
    # Pillow only warns between MAX_IMAGE_PIXELS and twice that; treat the warning as an error too.
    # Only the allowed decoders may run, and format/animation are checked before the full decode.
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(BytesIO(content), formats=sorted(_ALLOWED_PIL_FORMATS))
            if (image.format or "").upper() not in _ALLOWED_PIL_FORMATS:
                raise ImageOptimizeValidationError(
                    "Only jpeg, png, and webp images are allowed"
                )
            if getattr(image, "is_animated", False) and getattr(image, "n_frames", 1) > 1:
                raise ImageOptimizeValidationError("Animated images are not allowed")
            image.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ImageOptimizeValidationError("Image dimensions are too large") from error
    except UnidentifiedImageError as error:
        raise ImageOptimizeValidationError("File is not a valid image") from error
    except OSError as error:
        raise ImageOptimizeValidationError("File is not a valid image") from error

    transposed = ImageOps.exif_transpose(image)
    return transposed if transposed is not None else image


def optimize_image_bytes(
    content: bytes,
    *,
    content_type: str | None,
    source_file_id: str | None = None,
    variants: Iterable[str] | None = None,
    uploaded_by: str | None = None,
) -> dict[str, Any]:
    """Create requested WebP derivatives. imageId is a new UUID (≠ fileId).

    Each call allocates a new imageId and does not remove prior derivatives for
    the same sourceFileId. Callers must delete_derivatives when replacing.
    """
    requested_variants = _normalize_variants(variants)
    max_bytes = int(settings.media_max_file_bytes)
    if len(content) > max_bytes:
        raise ImageOptimizeValidationError(
            f"File exceeds maximum size of {max_bytes} bytes"
        )

    _assert_allowed_source(content=content, content_type=content_type)
    source = _open_source_image(content)

    display = _resize_long_edge(source, DISPLAY_MAX_EDGE)
    variant_bytes: dict[ImageVariant, bytes] = {
        "display": _encode_webp(display),
    }
    if "thumb" in requested_variants:
        variant_bytes["thumb"] = _encode_webp(
            _resize_long_edge(source, THUMB_MAX_EDGE)
        )

    image_id = str(uuid.uuid4())
    image_dir = settings.media_image_dir(image_id)
    image_dir.mkdir(parents=True, exist_ok=False)

    width, height = display.size
    meta = {
        **_derivative_meta(
            image_id=image_id,
            source_file_id=source_file_id or "",
            width=width,
            height=height,
            variants=list(requested_variants),
        ),
        "displayMaxEdge": DISPLAY_MAX_EDGE,
        "thumbMaxEdge": THUMB_MAX_EDGE,
        "uploadedBy": normalize_uploader(uploaded_by),
    }

    try:
        for variant, data in variant_bytes.items():
            _variant_path(image_dir, variant).write_bytes(data)
        write_json_store(_meta_path(image_dir), meta)
    except OSError:
        shutil.rmtree(image_dir, ignore_errors=True)
        raise

    if source_file_id:
        _register_derivative(source_file_id, image_id)
    return _to_response(meta)


def optimize_from_file_id(
    file_id: str,
    *,
    variants: Iterable[str] | None = None,
    uploaded_by: str | None = None,
) -> dict[str, Any]:
    try:
        record = get_file_record(file_id)
    except MediaFilesNotFoundError as error:
        raise ImageOptimizeNotFoundError(str(error)) from error

    meta = record["meta"]
    content = Path(record["path"]).read_bytes()
    return optimize_image_bytes(
        content,
        content_type=str(meta.get("contentType") or ""),
        source_file_id=str(meta.get("id") or file_id),
        variants=variants,
        uploaded_by=uploaded_by,
    )


def optimize_publish_from_file_id(
    file_id: str,
    target_width: int,
) -> dict[str, Any]:
    """Return an immutable display derivative sized for a published image.

    The original file is always the source. Existing derivatives with the same
    source, effective width, and encoder settings are reused.
    """
    try:
        requested_width = int(target_width)
    except (TypeError, ValueError) as error:
        raise ImageOptimizeValidationError("target width must be an integer") from error
    if not PUBLISH_MIN_WIDTH <= requested_width <= PUBLISH_MAX_WIDTH:
        raise ImageOptimizeValidationError(
            f"target width must be between {PUBLISH_MIN_WIDTH} and {PUBLISH_MAX_WIDTH}"
        )

    try:
        record = get_file_record(file_id)
    except MediaFilesNotFoundError as error:
        raise ImageOptimizeNotFoundError(str(error)) from error
    meta = record["meta"]
    source = _open_source_image(Path(record["path"]).read_bytes())
    effective_width = min(requested_width, source.width)

    source_id = str(meta.get("id") or file_id)
    reusable = _find_reusable_derivative(source_id, effective_width)
    if reusable is not None:
        return {**_to_response(reusable), "created": False}

    image = source if source.width == effective_width else source.resize(
        (effective_width, max(1, round(source.height * effective_width / source.width))),
        Image.Resampling.LANCZOS,
    )
    image_id = str(uuid.uuid4())
    image_dir = settings.media_image_dir(image_id)
    image_dir.mkdir(parents=True, exist_ok=False)
    try:
        _variant_path(image_dir, "display").write_bytes(_encode_webp(image))
        write_json_store(
            _meta_path(image_dir),
            _derivative_meta(
                image_id=image_id,
                source_file_id=source_id,
                width=image.width,
                height=image.height,
                variants=["display"],
            ),
        )
    except OSError:
        shutil.rmtree(image_dir, ignore_errors=True)
        raise
    _register_derivative(source_id, image_id)
    return {**_to_response(_read_meta(image_dir)), "created": True}


def _derivative_meta(
    *,
    image_id: str,
    source_file_id: str,
    width: int,
    height: int,
    variants: list[str],
) -> dict[str, Any]:
    return {
        "id": image_id,
        "sourceFileId": source_file_id,
        "width": width,
        "height": height,
        "variants": variants,
        "encoderQuality": WEBP_QUALITY,
        "encoderMethod": WEBP_METHOD,
        "createdAt": _utc_now_iso(),
    }


def _derived_ids_in(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return []
    raw = payload.get(DERIVED_IMAGE_IDS_KEY)
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, str)]


def _source_meta_path(source_file_id: str) -> Path:
    return settings.media_file_dir(source_file_id) / META_FILENAME


def _derived_image_ids(source_file_id: str) -> list[str]:
    try:
        payload = read_json_store(_source_meta_path(source_file_id))
    except (JsonStoreCorruptError, OSError):
        return []
    return _derived_ids_in(payload)


def _register_derivative(source_file_id: str, image_id: str) -> None:
    """Record imageId on the source file so publish can find reusable derivatives without a scan."""
    with _SOURCE_INDEX_LOCK:
        try:
            record_path = _source_meta_path(source_file_id)
            payload = read_json_store(record_path)
        except (JsonStoreCorruptError, OSError):
            return
        if not isinstance(payload, dict):
            return
        ids = _derived_ids_in(payload)
        if image_id in ids:
            return
        payload[DERIVED_IMAGE_IDS_KEY] = [*ids, image_id]
        write_json_store(record_path, payload)


def _find_reusable_derivative(source_file_id: str, width: int) -> dict[str, Any] | None:
    for image_id in _derived_image_ids(source_file_id):
        image_dir = settings.media_images_dir / image_id
        try:
            candidate = _read_meta(image_dir)
        except ImageOptimizeError:
            continue
        if (
            str(candidate.get("sourceFileId") or "") == source_file_id
            and candidate.get("width") == width
            and candidate.get("encoderQuality") == WEBP_QUALITY
            and candidate.get("encoderMethod") == WEBP_METHOD
            and _variant_path(image_dir, "display").is_file()
        ):
            return candidate
    return None


def get_image_variant(image_id: str, variant: ImageVariant) -> dict[str, Any]:
    validated_id = _validate_image_id(image_id)
    image_dir = settings.media_image_dir(validated_id)
    if not image_dir.is_dir():
        raise ImageOptimizeNotFoundError("Image not found")
    meta = _read_meta(image_dir)
    path = _variant_path(image_dir, variant)
    if not path.is_file():
        raise ImageOptimizeNotFoundError("Image not found")
    return {
        "meta": meta,
        "path": path,
        "response": _to_response(meta),
        "variant": variant,
        "mediaType": "image/webp",
        "filename": path.name,
    }


def delete_derivatives(image_id: str) -> None:
    validated_id = _validate_image_id(image_id)
    image_dir = settings.media_image_dir(validated_id)
    if not image_dir.is_dir():
        raise ImageOptimizeNotFoundError("Image not found")
    shutil.rmtree(image_dir)
