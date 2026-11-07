import logging
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core.config import settings
from core.json_store import JsonStoreCorruptError, read_json_store, write_json_store
from services.page_catalog import all_slugs, is_known_slug


logger = logging.getLogger(__name__)

ALLOWED_PAGE_SLUGS = all_slugs()

_LANGUAGE_CODE_RE = re.compile(r"^[a-z]{2,3}(-[a-zA-Z0-9]+)*$")
_REVISION_KEY = "contentRevision"
_CONTENT_KEY = "content"

_page_locks: dict[str, threading.RLock] = {}
_page_locks_guard = threading.Lock()


@dataclass(frozen=True)
class PageDocument:
    revision: int
    content: dict[str, dict[str, str]] = field(default_factory=dict)


class PageContentConflictError(Exception):
    def __init__(self, current: PageDocument) -> None:
        super().__init__("contentRevision mismatch")
        self.current = current


def is_allowed_slug(slug: str) -> bool:
    return is_known_slug(slug)


def get_default_page_content(_slug: str) -> dict[str, dict[str, str]]:
    return {}


def _normalize_copy(raw: object) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    return {
        "title": str(raw.get("title", "")),
        "subtitle": str(raw.get("subtitle", "")),
        "description": str(raw.get("description", "")),
    }


def normalize_page_content(raw: object) -> dict[str, dict[str, str]]:
    if not isinstance(raw, dict) or isinstance(raw, list):
        return {}

    normalized: dict[str, dict[str, str]] = {}
    for code, copy in raw.items():
        language = str(code).strip()
        if not _LANGUAGE_CODE_RE.match(language):
            continue
        normalized_copy = _normalize_copy(copy)
        if normalized_copy is None:
            continue
        normalized[language] = normalized_copy
    return normalized


def _parse_document(parsed: Any) -> PageDocument | None:
    if not isinstance(parsed, dict):
        return None
    revision = parsed.get(_REVISION_KEY)
    content = parsed.get(_CONTENT_KEY)
    if isinstance(revision, int) and isinstance(content, dict):
        return PageDocument(
            revision=max(1, revision),
            content=normalize_page_content(content),
        )
    # Files written before revisions existed are a bare language map.
    return PageDocument(revision=1, content=normalize_page_content(parsed))


def _read_document(path: Path, *, strict: bool) -> PageDocument | None:
    try:
        parsed = read_json_store(path)
    except JsonStoreCorruptError as error:
        if strict:
            raise
        logger.error("Failed to load page content %s: %s", path, error)
        return None
    if parsed is None:
        return None
    return _parse_document(parsed)


def _write_document(path: Path, document: PageDocument) -> None:
    write_json_store(
        path,
        {_REVISION_KEY: document.revision, _CONTENT_KEY: document.content},
    )


def _page_lock(slug: str) -> threading.RLock:
    with _page_locks_guard:
        lock = _page_locks.get(slug)
        if lock is None:
            lock = threading.RLock()
            _page_locks[slug] = lock
        return lock


def get_page_document(slug: str) -> PageDocument:
    """Current content and revision. A missing page is revision 0 with no content."""
    stored = _read_document(settings.page_content_file(slug), strict=False)
    if stored is None:
        return PageDocument(revision=0, content=get_default_page_content(slug))
    return stored


def get_page_content(slug: str) -> dict[str, dict[str, str]]:
    return get_page_document(slug).content


def save_page_content(
    slug: str,
    content: dict[str, dict[str, str]],
    *,
    expected_revision: int,
) -> PageDocument:
    path = settings.page_content_file(slug)
    with _page_lock(slug):
        current = _read_document(path, strict=True) or PageDocument(revision=0)
        if expected_revision != current.revision:
            raise PageContentConflictError(current)
        saved = PageDocument(
            revision=current.revision + 1,
            content=normalize_page_content(content),
        )
        _write_document(path, saved)
        return saved


def _remove_language_from_page(path: Path, slug: str, language: str) -> None:
    with _page_lock(slug):
        stored = _read_document(path, strict=False)
        if stored is None or language not in stored.content:
            return
        next_content = {
            code: copy for code, copy in stored.content.items() if code != language
        }
        _write_document(
            path,
            PageDocument(revision=stored.revision + 1, content=next_content),
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
