import logging
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core.config import settings
from core.json_store import JsonStoreCorruptError, read_json_store, write_json_store
from core.store_lock import STORE_LOCK
from services.page_catalog import all_slugs, is_known_slug


logger = logging.getLogger(__name__)

ALLOWED_PAGE_SLUGS = all_slugs()

_LANGUAGE_CODE_RE = re.compile(r"^[a-z]{2,3}(-[a-zA-Z0-9]+)*$")
_REVISION_KEY = "contentRevision"
_CONTENT_KEY = "content"
_SHARED_MEDIA_KEY = "sharedMedia"
_HOME_TEXT_FIELDS = (
    "yearMotto",
    "bibleVerse",
    "bibleReference",
)
_HOME_SHARED_FIELDS = (
    "heroImages",
    "panoramaImageId",
    "panoramaSourceFileId",
    "youtubeVideoUrls",
)
_page_locks: dict[str, threading.RLock] = {}
_page_locks_guard = threading.Lock()


@dataclass(frozen=True)
class PageDocument:
    revision: int
    content: dict[str, dict[str, Any]] = field(default_factory=dict)
    shared_media: dict[str, Any] = field(default_factory=dict)


class PageContentConflictError(Exception):
    def __init__(self, current: PageDocument) -> None:
        super().__init__("contentRevision mismatch")
        self.current = current


def is_allowed_slug(slug: str) -> bool:
    return is_known_slug(slug)


def get_default_page_content(_slug: str) -> dict[str, dict[str, Any]]:
    return {}


def _normalize_home_shared_media(raw: object) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    images = source.get("heroImages")
    hero_images = (
        [
            {
                "imageId": str(image.get("imageId") or ""),
                "sourceFileId": str(image.get("sourceFileId") or ""),
            }
            for image in images
            if isinstance(image, dict)
            and (image.get("imageId") or image.get("sourceFileId"))
        ]
        if isinstance(images, list)
        else []
    )
    urls = source.get("youtubeVideoUrls")
    return {
        "heroImages": hero_images,
        "panoramaImageId": str(source.get("panoramaImageId") or ""),
        "panoramaSourceFileId": str(source.get("panoramaSourceFileId") or ""),
        "youtubeVideoUrls": (
            [str(url).strip() for url in urls if str(url).strip()]
            if isinstance(urls, list)
            else []
        ),
    }


def _normalize_copy(raw: object, *, home: bool = False) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    if not home:
        return dict(raw)

    normalized = {
        key: str(raw.get(key) or "")
        for key in _HOME_TEXT_FIELDS
        if key in raw
    }
    shared = {
        key: raw[key]
        for key in _HOME_SHARED_FIELDS
        if key in raw
    }
    if "heroImages" not in shared:
        legacy_image_id = str(raw.get("heroImageId") or "")
        legacy_source_file_id = str(raw.get("heroSourceFileId") or "")
        if legacy_image_id or legacy_source_file_id:
            shared["heroImages"] = [
                {
                    "imageId": legacy_image_id,
                    "sourceFileId": legacy_source_file_id,
                }
            ]
    legacy_url = str(raw.get("youtubeVideoUrl") or "").strip()
    if "youtubeVideoUrls" not in shared and legacy_url:
        shared["youtubeVideoUrls"] = [legacy_url]
    normalized.update(shared)
    return normalized


def normalize_page_content(
    raw: object, *, home: bool = False
) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, dict) or isinstance(raw, list):
        return {}

    normalized: dict[str, dict[str, Any]] = {}
    for code, copy in raw.items():
        language = str(code).strip()
        if not _LANGUAGE_CODE_RE.match(language):
            continue
        normalized_copy = _normalize_copy(copy, home=home)
        if normalized_copy is None:
            continue
        normalized[language] = normalized_copy
    return normalized


def _copy_shared_home_media(copies: dict[str, dict[str, Any]]) -> dict[str, Any]:
    shared: dict[str, Any] = {}
    for fields in (
        ("heroImages",),
        ("panoramaImageId", "panoramaSourceFileId"),
        ("youtubeVideoUrls",),
    ):
        candidates = [copies.get("en", {})] + [
            copy for language, copy in copies.items() if language != "en"
        ]
        for copy in candidates:
            if any(copy.get(field) for field in fields):
                shared.update({field: copy.get(field) for field in fields})
                break
    return _normalize_home_shared_media(shared)


def _expand_home_content(
    content: dict[str, dict[str, Any]], shared_media: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    return {
        language: {
            **{
                key: value
                for key, value in copy.items()
                if key not in _HOME_SHARED_FIELDS
            },
            **shared_media,
        }
        for language, copy in content.items()
    }


def _parse_document(parsed: Any, *, slug: str) -> PageDocument | None:
    if not isinstance(parsed, dict):
        return None
    revision = parsed.get(_REVISION_KEY)
    content = parsed.get(_CONTENT_KEY)
    if isinstance(revision, int) and isinstance(content, dict):
        normalized = normalize_page_content(content, home=slug == "home")
        if slug == "home":
            raw_shared = parsed.get(_SHARED_MEDIA_KEY)
            shared_media = (
                _normalize_home_shared_media(raw_shared)
                if isinstance(raw_shared, dict)
                else _copy_shared_home_media(normalized)
            )
            normalized = _expand_home_content(normalized, shared_media)
            return PageDocument(
                revision=max(1, revision),
                content=normalized,
                shared_media=shared_media,
            )
        return PageDocument(
            revision=max(1, revision),
            content=normalized,
        )
    # Files written before revisions existed are a bare language map.
    normalized = normalize_page_content(parsed, home=slug == "home")
    if slug == "home":
        shared_media = _copy_shared_home_media(normalized)
        return PageDocument(
            revision=1,
            content=_expand_home_content(normalized, shared_media),
            shared_media=shared_media,
        )
    return PageDocument(revision=1, content=normalized)


def _read_document(path: Path, *, strict: bool, slug: str) -> PageDocument | None:
    try:
        parsed = read_json_store(path)
    except JsonStoreCorruptError as error:
        if strict:
            raise
        logger.error("Failed to load page content %s: %s", path, error)
        return None
    if parsed is None:
        return None
    return _parse_document(parsed, slug=slug)


def _write_document(path: Path, document: PageDocument, *, slug: str) -> None:
    payload: dict[str, Any] = {
        _REVISION_KEY: document.revision,
        _CONTENT_KEY: document.content,
    }
    if slug == "home":
        payload[_CONTENT_KEY] = {
            language: {
                key: value
                for key, value in copy.items()
                if key not in _HOME_SHARED_FIELDS
            }
            for language, copy in document.content.items()
        }
        payload[_SHARED_MEDIA_KEY] = _normalize_home_shared_media(
            document.shared_media
        )
    write_json_store(path, payload)


def _page_lock(slug: str) -> threading.RLock:
    with _page_locks_guard:
        lock = _page_locks.get(slug)
        if lock is None:
            lock = threading.RLock()
            _page_locks[slug] = lock
        return lock


def get_page_document(slug: str) -> PageDocument:
    """Current content and revision. A missing page is revision 0 with no content."""
    stored = _read_document(settings.page_content_file(slug), strict=False, slug=slug)
    if stored is None:
        return PageDocument(revision=0, content=get_default_page_content(slug))
    return stored


def get_page_content(slug: str) -> dict[str, dict[str, Any]]:
    return get_page_document(slug).content


def get_home_media_refs() -> set[str]:
    with _page_lock("home"):
        document = _read_document(
            settings.page_content_file("home"), strict=True, slug="home"
        )
    if document is None:
        return set()
    refs: set[str] = set()
    for image in document.shared_media.get("heroImages") or []:
        refs.update(
            str(image.get(field) or "")
            for field in ("imageId", "sourceFileId")
            if image.get(field)
        )
    refs.update(
        str(document.shared_media.get(field) or "")
        for field in ("panoramaImageId", "panoramaSourceFileId")
        if document.shared_media.get(field)
    )
    return refs


def save_page_content(
    slug: str,
    content: dict[str, dict[str, Any]],
    *,
    expected_revision: int,
    shared_media: dict[str, Any] | None = None,
) -> PageDocument:
    path = settings.page_content_file(slug)
    with STORE_LOCK:
        with _page_lock(slug):
            current = _read_document(path, strict=True, slug=slug) or PageDocument(revision=0)
            if expected_revision != current.revision:
                raise PageContentConflictError(current)
            normalized_content = normalize_page_content(content, home=slug == "home")
            next_shared_media: dict[str, Any] = {}
            if slug == "home":
                next_shared_media = (
                    _normalize_home_shared_media(shared_media)
                    if shared_media is not None
                    else _copy_shared_home_media(normalized_content)
                )
                if shared_media is None and not any(
                    next_shared_media.get(key)
                    for key in ("heroImages", "panoramaImageId", "panoramaSourceFileId", "youtubeVideoUrls")
                ):
                    next_shared_media = current.shared_media
                normalized_content = {
                    language: {
                        key: value
                        for key, value in copy.items()
                        if key not in _HOME_SHARED_FIELDS
                    }
                    for language, copy in normalized_content.items()
                }
            saved = PageDocument(
                revision=current.revision + 1,
                content=normalized_content,
                shared_media=next_shared_media,
            )
            for language, copy in saved.content.items():
                previous = {
                    key: value
                    for key, value in current.content.get(language, {}).items()
                    if key not in _HOME_SHARED_FIELDS
                }
                for key, value in previous.items():
                    copy.setdefault(key, value)
            if slug == "home":
                saved = PageDocument(
                    revision=saved.revision,
                    content=_expand_home_content(saved.content, saved.shared_media),
                    shared_media=saved.shared_media,
                )
            _write_document(path, saved, slug=slug)

        if slug == "home":
            old_image_ids = {
                str(image.get("imageId") or "")
                for image in current.shared_media.get("heroImages") or []
            } | {str(current.shared_media.get("panoramaImageId") or "")}
            old_file_ids = {
                str(image.get("sourceFileId") or "")
                for image in current.shared_media.get("heroImages") or []
            } | {str(current.shared_media.get("panoramaSourceFileId") or "")}
            try:
                from services.media_refs import cleanup_unused_media

                cleanup_unused_media(
                    image_ids=old_image_ids,
                    file_ids=old_file_ids,
                )
            except Exception:
                logger.exception("Failed to clean up replaced Home media")

        return saved


def _remove_language_from_page(path: Path, slug: str, language: str) -> None:
    with _page_lock(slug):
        stored = _read_document(path, strict=False, slug=slug)
        if stored is None or language not in stored.content:
            return
        next_content = {
            code: copy for code, copy in stored.content.items() if code != language
        }
        _write_document(
            path,
            PageDocument(
                revision=stored.revision + 1,
                content=next_content,
                shared_media=stored.shared_media,
            ),
            slug=slug,
        )


def remove_language_from_all_pages(language: str) -> None:
    for slug in ALLOWED_PAGE_SLUGS:
        _remove_language_from_page(settings.page_content_file(slug), slug, language)

    pages_dir = settings.pages_dir
    if not pages_dir.exists():
        return

    for path in pages_dir.glob("*.json"):
        slug = path.stem
        if slug in ALLOWED_PAGE_SLUGS:
            continue
        _remove_language_from_page(path, slug, language)
