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
_CHURCH_HISTORY_BASELINE_FILE = (
    Path(__file__).parent.parent / "data" / "seed" / "church-history.json"
)
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
    if _slug == "visit":
        seed_path = (
            Path(__file__).parent.parent
            / "data"
            / "pages"
            / f"{_slug}.json"
        )
        seed_document = _read_document(seed_path, strict=False, slug=_slug)
        if seed_document is not None:
            return seed_document.content
    return {}


def get_church_history_baseline_content() -> dict[str, dict[str, Any]]:
    raw = read_json_store(_CHURCH_HISTORY_BASELINE_FILE)
    if not isinstance(raw, dict):
        raise RuntimeError("Church History baseline content is unavailable")
    return normalize_page_content(raw)


def _church_history_baseline_ids() -> set[str]:
    return {
        str(event.get("id"))
        for copy in get_church_history_baseline_content().values()
        for event in copy.get("events", [])
        if isinstance(event, dict) and event.get("id")
    }


def _normalize_church_history_shared_media(
    raw: object,
    content: object,
) -> dict[str, Any]:
    media = raw.get("events") if isinstance(raw, dict) else None
    normalized_events: dict[str, dict[str, str]] = {}
    if isinstance(media, dict):
        for event_id, value in media.items():
            if not isinstance(value, dict):
                continue
            image = {
                field: str(value.get(field) or "")
                for field in ("imageId", "sourceFileId")
            }
            if any(image.values()):
                normalized_events[str(event_id)] = image

    copies = content.values() if isinstance(content, dict) else []
    content_event_ids: set[str] = set()
    for copy in copies:
        events = copy.get("events") if isinstance(copy, dict) else None
        if not isinstance(events, list):
            continue
        for event in events:
            if not isinstance(event, dict):
                continue
            event_id = str(event.get("id") or "")
            if not event_id:
                continue
            content_event_ids.add(event_id)
            image = normalized_events.setdefault(
                event_id, {"imageId": "", "sourceFileId": ""}
            )
            for field in ("imageId", "sourceFileId"):
                image[field] = image[field] or str(event.get(field) or "")
            if not any(image.values()):
                normalized_events.pop(event_id, None)

    baseline_ids = _church_history_baseline_ids()
    return {
        "events": {
            event_id: image
            for event_id, image in normalized_events.items()
            if (
                event_id in content_event_ids
                and event_id not in baseline_ids
                and any(image.values())
            )
        }
    }


def _normalize_visit_shared_media(raw: object) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    normalized: dict[str, list[dict[str, str]]] = {}
    for group in ("mapImages", "venueImages"):
        images = source.get(group)
        normalized[group] = (
            [
                {
                    "imageId": str(image.get("imageId") or ""),
                    "sourceFileId": str(image.get("sourceFileId") or ""),
                }
                for image in images
                if isinstance(image, dict)
                and image.get("imageId")
                and image.get("sourceFileId")
            ]
            if isinstance(images, list)
            else []
        )
    return normalized


def get_church_history_public_document() -> PageDocument:
    editable = get_page_document("church-history")
    baseline = get_church_history_baseline_content()
    languages = dict.fromkeys([*baseline, *editable.content])
    shared_events = editable.shared_media.get("events", {})
    content = {
        language: {
            **baseline.get(language, {}),
            **editable.content.get(language, {}),
            "events": [
                *(baseline.get(language, {}).get("events") or []),
                *[
                    {
                        **event,
                        **(
                            shared_events.get(str(event.get("id")), {})
                            if isinstance(event, dict)
                            else {}
                        ),
                    }
                    for event in editable.content.get(language, {}).get("events", [])
                ],
            ],
        }
        for language in languages
    }
    return PageDocument(revision=editable.revision, content=content)


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


def _normalize_content_for_slug(
    raw: object, slug: str
) -> dict[str, dict[str, Any]]:
    content = normalize_page_content(raw, home=slug == "home")
    if slug == "church-vision":
        return {
            language: {
                key: value for key, value in copy.items() if key != "heading"
            }
            for language, copy in content.items()
        }
    if slug != "church-history":
        return content
    baseline_ids = _church_history_baseline_ids()
    return {
        language: {
            **{
                key: value
                for key, value in copy.items()
                if key not in {"introduction", "events"}
            },
            **(
                {
                    "events": [
                        {
                            key: value
                            for key, value in event.items()
                            if key not in {
                                "title",
                                "imageUrl",
                                "imageId",
                                "sourceFileId",
                            }
                        }
                        if isinstance(event, dict)
                        else event
                        for event in copy["events"]
                        if not isinstance(event, dict)
                        or str(event.get("id") or "") not in baseline_ids
                    ]
                }
                if isinstance(copy.get("events"), list)
                else {}
            ),
        }
        for language, copy in content.items()
    }


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
        normalized = _normalize_content_for_slug(content, slug)
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
        if slug == "church-history":
            return PageDocument(
                revision=max(1, revision),
                content=normalized,
                shared_media=_normalize_church_history_shared_media(
                    parsed.get(_SHARED_MEDIA_KEY), content
                ),
            )
        if slug == "visit":
            return PageDocument(
                revision=max(1, revision),
                content=normalized,
                shared_media=(
                    _normalize_visit_shared_media(parsed.get(_SHARED_MEDIA_KEY))
                    if _SHARED_MEDIA_KEY in parsed
                    else {}
                ),
            )
        return PageDocument(
            revision=max(1, revision),
            content=normalized,
        )
    # Files written before revisions existed are a bare language map.
    normalized = _normalize_content_for_slug(parsed, slug)
    if slug == "home":
        shared_media = _copy_shared_home_media(normalized)
        return PageDocument(
            revision=1,
            content=_expand_home_content(normalized, shared_media),
            shared_media=shared_media,
        )
    if slug == "church-history":
        return PageDocument(
            revision=1,
            content=normalized,
            shared_media=_normalize_church_history_shared_media(None, parsed),
        )
    if slug == "visit":
        return PageDocument(
            revision=1,
            content=normalized,
            shared_media=(
                _normalize_visit_shared_media(parsed.get(_SHARED_MEDIA_KEY))
                if _SHARED_MEDIA_KEY in parsed
                else {}
            ),
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
    elif slug == "church-history":
        payload[_SHARED_MEDIA_KEY] = _normalize_church_history_shared_media(
            document.shared_media, document.content
        )
    elif slug == "visit":
        if document.shared_media:
            payload[_SHARED_MEDIA_KEY] = _normalize_visit_shared_media(
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


def get_church_history_media_refs() -> set[str]:
    with _page_lock("church-history"):
        document = _read_document(
            settings.page_content_file("church-history"),
            strict=True,
            slug="church-history",
        )
    if document is None:
        content = get_default_page_content("church-history")
        shared_media: dict[str, Any] = {}
    else:
        content = document.content
        shared_media = document.shared_media
    image_ids, file_ids = _page_media_refs(content, shared_media)
    return image_ids | file_ids


def get_visit_media_refs() -> set[str]:
    with _page_lock("visit"):
        document = _read_document(
            settings.page_content_file("visit"), strict=True, slug="visit"
        )
    if document is None:
        return set()
    return {
        str(image.get(field) or "")
        for group in ("mapImages", "venueImages")
        for image in document.shared_media.get(group, [])
        for field in ("imageId", "sourceFileId")
        if image.get(field)
    }


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
            normalized_content = _normalize_content_for_slug(content, slug)
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
            elif slug == "church-history":
                next_shared_media = _normalize_church_history_shared_media(
                    shared_media, content
                )
                if shared_media is None:
                    for event_id, image in current.shared_media.get(
                        "events", {}
                    ).items():
                        if any(
                            event.get("id") == event_id
                            for copy in normalized_content.values()
                            for event in copy.get("events", [])
                        ):
                            next_shared_media.setdefault("events", {}).setdefault(
                                event_id, image
                            )
            elif slug == "visit":
                next_shared_media = (
                    _normalize_visit_shared_media(shared_media)
                    if shared_media is not None
                    else current.shared_media
                )
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
        elif slug == "church-history":
            old_refs = _page_media_refs(current.content, current.shared_media)
            new_refs = _page_media_refs(saved.content, saved.shared_media)
            try:
                from services.media_refs import cleanup_unused_media

                cleanup_unused_media(
                    image_ids=old_refs[0] - new_refs[0],
                    file_ids=old_refs[1] - new_refs[1],
                )
            except Exception:
                logger.exception("Failed to clean up replaced Church History media")
        elif slug == "visit":
            old_refs = _visit_media_refs(current.shared_media)
            new_refs = _visit_media_refs(saved.shared_media)
            try:
                from services.media_refs import cleanup_unused_media

                cleanup_unused_media(
                    image_ids=old_refs[0] - new_refs[0],
                    file_ids=old_refs[1] - new_refs[1],
                )
            except Exception:
                logger.exception("Failed to clean up replaced Visit media")

        return saved


def _visit_media_refs(
    shared_media: dict[str, Any] | None,
) -> tuple[set[str], set[str]]:
    image_ids: set[str] = set()
    file_ids: set[str] = set()
    for group in ("mapImages", "venueImages"):
        for image in (shared_media or {}).get(group, []):
            if not isinstance(image, dict):
                continue
            if image.get("imageId"):
                image_ids.add(str(image["imageId"]))
            if image.get("sourceFileId"):
                file_ids.add(str(image["sourceFileId"]))
    return image_ids, file_ids


def _page_media_refs(
    content: dict[str, dict[str, Any]],
    shared_media: dict[str, Any] | None = None,
) -> tuple[set[str], set[str]]:
    image_ids: set[str] = set()
    file_ids: set[str] = set()
    for copy in content.values():
        events = copy.get("events") if isinstance(copy, dict) else None
        if not isinstance(events, list):
            continue
        for event in events:
            if not isinstance(event, dict):
                continue
            if event.get("imageId"):
                image_ids.add(str(event["imageId"]))
            if event.get("sourceFileId"):
                file_ids.add(str(event["sourceFileId"]))
    for image in (shared_media or {}).get("events", {}).values():
        if not isinstance(image, dict):
            continue
        if image.get("imageId"):
            image_ids.add(str(image["imageId"]))
        if image.get("sourceFileId"):
            file_ids.add(str(image["sourceFileId"]))
    return image_ids, file_ids


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
