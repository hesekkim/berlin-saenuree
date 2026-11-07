"""Shared rich-text HTML sanitize helpers (editor subset).

Allowlist matches TipTap / RichTextEditor `toStoredRichTextHtml` output.
Domain-specific migration (e.g. popup title→body) lives outside this module.
"""

from __future__ import annotations

import re
from html import escape, unescape
from html.parser import HTMLParser
from urllib.parse import urlparse

from services.media_files_service import FILE_ID_RE, MEDIA_FILE_PATH_PREFIX

MAX_RICH_HTML_LENGTH = 20_000
MAX_BLOGGER_RICH_HTML_LENGTH = 200_000


class RichHtmlTooLongError(ValueError):
    """Submitted rich text exceeds the limit. Rejected, never truncated."""

    def __init__(self, max_length: int) -> None:
        super().__init__("Content is too long")
        self.max_length = max_length

ALLOWED_TAGS = frozenset(
    {"p", "ul", "ol", "li", "strong", "em", "b", "i", "u", "s", "a", "span", "br", "img"}
)
VOID_TAGS = frozenset({"br", "img"})
# Drop tag and descendants (XSS / non-content).
SKIP_TAGS = frozenset(
    {"script", "style", "iframe", "object", "embed", "link", "meta", "noscript"}
)
# TipTap may emit b/i; normalize to strong/em on sanitize.
TAG_ALIASES = {"b": "strong", "i": "em"}

ALLOWED_ALIGN = frozenset({"left", "center", "right"})
ALLOWED_FONT_SIZES = frozenset(
    {"12px", "14px", "16px", "18px", "20px", "24px"}
)
HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
RGB_COLOR_RE = re.compile(
    r"^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})"
    r"(?:\s*,\s*(?:0|1|0?\.\d+)\s*)?\)$",
    re.IGNORECASE,
)
HTML_HINT_RE = re.compile(
    r"</?(?:p|ul|ol|li|strong|em|b|i|u|s|a|span|br|img)\b",
    re.IGNORECASE,
)
STYLE_DECL_RE = re.compile(r"([a-zA-Z-]+)\s*:\s*([^;]+)")
INLINE_STYLE_TAGS = frozenset({"span", "strong", "em", "u", "s"})

MAX_MEDIA_NAME_LENGTH = 200
CONTENT_TYPE_RE = re.compile(
    r"^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$",
    re.IGNORECASE,
)
# Upper bound well above any accepted upload; guards absurd stored values.
MAX_MEDIA_SIZE_BYTES = 1024**4
MIN_MEDIA_WIDTH = 32
MAX_MEDIA_WIDTH = 1200
MEDIA_ID_ATTR_RE = re.compile(r'data-media-id="([^"]+)"')
IMAGE_ID_ATTR_RE = re.compile(r'data-image-id="([^"]+)"')


def _media_url(media_id: str, *, download: bool = False) -> str:
    suffix = "?download=true" if download else ""
    return f"{MEDIA_FILE_PATH_PREFIX}{media_id}{suffix}"


def _image_variant_url(image_id: str, *, variant: str = "display") -> str:
    return f"/api/v1/media/images/{image_id}/{variant}"


def _normalize_media_content_type(raw: str) -> str | None:
    value = (raw or "").strip().lower()
    return value if CONTENT_TYPE_RE.fullmatch(value) else None


def _normalize_media_size_bytes(raw: str) -> int | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        size = int(value)
    except ValueError:
        return None
    if size < 0 or size > MAX_MEDIA_SIZE_BYTES:
        return None
    return size


def _normalize_media_width(raw: str) -> int | None:
    value = (raw or '').strip()
    if not value or not re.fullmatch(r"\d+", value):
        return None
    try:
        width = int(value)
    except ValueError:
        return None
    if width < MIN_MEDIA_WIDTH or width > MAX_MEDIA_WIDTH:
        return None
    return width


def looks_like_html(text: str) -> bool:
    return bool(HTML_HINT_RE.search(text))


def _normalize_color_value(raw: str) -> str | None:
    """Accept #hex / rgb() / rgba() (browsers often rewrite hex → rgb)."""
    value = (raw or "").strip()
    if HEX_COLOR_RE.match(value):
        if len(value) == 4:
            return "#" + "".join(ch * 2 for ch in value[1:].lower())
        return value.lower()
    match = RGB_COLOR_RE.match(value)
    if not match:
        return None
    channels = [int(match.group(i)) for i in (1, 2, 3)]
    if any(channel > 255 for channel in channels):
        return None
    return "#" + "".join(f"{channel:02x}" for channel in channels)


def _is_acceptable_host(host: str) -> bool:
    normalized = host.strip().lower().rstrip(".")
    if not normalized:
        return False
    if normalized == "localhost":
        return True
    if re.fullmatch(r"\d+", normalized):
        return False
    if re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", normalized):
        return all(
            part.isdigit()
            and 0 <= int(part) <= 255
            and str(int(part)) == part
            for part in normalized.split(".")
        )
    if "." not in normalized:
        return False
    labels = normalized.split(".")
    if any(not label or len(label) > 63 for label in labels):
        return False
    tld = labels[-1]
    if len(tld) < 2 or not re.fullmatch(r"[a-z]{2,}", tld, re.I):
        if not (tld.startswith("xn--") and len(tld) > 4):
            return False
    return all(
        re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|xn--[a-z0-9-]+)", label, re.I)
        for label in labels
    )


def normalize_link_url(raw: str) -> str | None:
    """Mirror frontend `shared/lib/richText` `normalizeLinkUrl` — http(s) only."""
    trimmed = (raw or "").strip()
    if not trimmed or trimmed in {"https://", "http://"}:
        return None

    without_protocol = re.sub(
        r"^[a-zA-Z][a-zA-Z\d+.-]*://", "", trimmed, count=1
    )
    authority = without_protocol.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    if "@" in authority:
        authority = authority[authority.rfind("@") + 1 :]
    if authority.startswith("["):
        end = authority.find("]")
        host_candidate = authority[1:end] if end >= 0 else authority
    else:
        host_candidate = authority.split(":", 1)[0]

    if not _is_acceptable_host(host_candidate):
        return None

    try:
        with_protocol = (
            trimmed
            if re.match(r"^[a-zA-Z][a-zA-Z\d+.-]*:", trimmed)
            else f"https://{trimmed}"
        )
        parsed = urlparse(with_protocol)
        if parsed.scheme not in {"http", "https"}:
            return None
        if not _is_acceptable_host(parsed.hostname or ""):
            return None
        # Rebuild to a stable string (matches URL.toString() intent).
        return parsed.geturl()
    except ValueError:
        return None


def _sanitize_style(style: str, *, allow_align: bool) -> str | None:
    kept: list[str] = []
    for match in STYLE_DECL_RE.finditer(style or ""):
        prop = match.group(1).strip().lower()
        value = match.group(2).strip()
        if prop == "color":
            color = _normalize_color_value(value)
            if color:
                kept.append(f"color: {color}")
        elif prop == "font-size" and value.replace(" ", "") in ALLOWED_FONT_SIZES:
            kept.append(f"font-size: {value.replace(' ', '')}")
        elif (
            allow_align
            and prop == "text-align"
            and value.lower() in ALLOWED_ALIGN
        ):
            kept.append(f"text-align: {value.lower()}")
    if not kept:
        return None
    return "; ".join(kept)


def _attrs_for_tag(tag: str, attrs: list[tuple[str, str | None]]) -> str:
    attr_map = {k.lower(): (v or "") for k, v in attrs if k}
    parts: list[str] = []

    media_id = attr_map.get("data-media-id", "").strip()
    if tag == "img":
        if not FILE_ID_RE.fullmatch(media_id):
            return ""
        image_id = attr_map.get("data-image-id", "").strip()
        src = attr_map.get("src", "").strip()
        allowed_srcs = {_media_url(media_id)}
        if FILE_ID_RE.fullmatch(image_id):
            allowed_srcs.add(_image_variant_url(image_id, variant="display"))
        if src not in allowed_srcs:
            return ""
        alt = attr_map.get("alt", "")[:MAX_MEDIA_NAME_LENGTH]
        parts.append(f'data-media-id="{escape(media_id, quote=True)}"')
        if FILE_ID_RE.fullmatch(image_id):
            parts.append(f'data-image-id="{escape(image_id, quote=True)}"')
        parts.append(f'src="{escape(src, quote=True)}"')
        parts.append(f'alt="{escape(alt, quote=True)}"')
        width = _normalize_media_width(attr_map.get('data-media-width', ''))
        if width is not None:
            parts.append(f'data-media-width="{width}"')
            parts.append(f'width="{width}"')
    elif tag == "a" and attr_map.get("data-media-kind") == "attachment":
        href = attr_map.get("href", "").strip()
        if not FILE_ID_RE.fullmatch(media_id) or href != _media_url(
            media_id, download=True
        ):
            return ""
        name = attr_map.get("data-media-name", "")[:MAX_MEDIA_NAME_LENGTH]
        parts.append(f'data-media-id="{escape(media_id, quote=True)}"')
        parts.append('data-media-kind="attachment"')
        parts.append(f'data-media-name="{escape(name, quote=True)}"')
        content_type = _normalize_media_content_type(
            attr_map.get("data-media-content-type", "")
        )
        if content_type:
            parts.append(
                f'data-media-content-type="{escape(content_type, quote=True)}"'
            )
        size_bytes = _normalize_media_size_bytes(attr_map.get("data-media-size", ""))
        if size_bytes is not None:
            parts.append(f'data-media-size="{size_bytes}"')
        parts.append(f'href="{escape(href, quote=True)}"')
    elif tag == "a":
        href = normalize_link_url(attr_map.get("href", ""))
        if not href:
            return ""
        parts.append(f'href="{escape(href, quote=True)}"')
        parts.append('rel="noopener noreferrer nofollow"')
        parts.append('target="_blank"')
        class_name = attr_map.get("class", "").strip()
        if class_name == "rich-text-link" or "rich-text-link" in class_name.split():
            parts.append('class="rich-text-link"')
    elif tag in {"p", "li"}:
        style = _sanitize_style(attr_map.get("style", ""), allow_align=True)
        if style:
            parts.append(f'style="{escape(style, quote=True)}"')
    elif tag in INLINE_STYLE_TAGS:
        style = _sanitize_style(attr_map.get("style", ""), allow_align=False)
        if style:
            parts.append(f'style="{escape(style, quote=True)}"')

    if not parts:
        return ""
    return " " + " ".join(parts)


class _RichHtmlSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._out: list[str] = []
        self._stack: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._skip_depth:
            self._skip_depth += 1
            return
        name = tag.lower()
        if name in SKIP_TAGS:
            self._skip_depth = 1
            return
        if name not in ALLOWED_TAGS:
            # Unknown tag: unwrap (keep text children).
            return
        name = TAG_ALIASES.get(name, name)
        if name == "a":
            attr_html = _attrs_for_tag(name, attrs)
            if not attr_html:
                # Invalid link — keep text children, drop the anchor wrapper.
                self._stack.append("__unwrap__")
                return
            self._out.append(f"<a{attr_html}>")
            self._stack.append("a")
            return
        if name in VOID_TAGS:
            attr_html = _attrs_for_tag(name, attrs)
            if name == "img" and not attr_html:
                return
            self._out.append(f"<{name}{attr_html}>")
            return
        attr_html = _attrs_for_tag(name, attrs)
        self._out.append(f"<{name}{attr_html}>")
        self._stack.append(name)

    def handle_endtag(self, tag: str) -> None:
        if self._skip_depth:
            self._skip_depth -= 1
            return
        raw = tag.lower()
        if raw in SKIP_TAGS or raw not in ALLOWED_TAGS:
            return
        name = TAG_ALIASES.get(raw, raw)
        if name in VOID_TAGS:
            return
        if not self._stack:
            return
        top = self._stack[-1]
        if top == "__unwrap__" and name == "a":
            self._stack.pop()
            return
        if top != name:
            return
        self._stack.pop()
        self._out.append(f"</{name}>")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if data:
            self._out.append(escape(data, quote=False))

    def handle_entityref(self, name: str) -> None:
        self.handle_data(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.handle_data(f"&#{name};")

    def result(self) -> str:
        # Close any unclosed tags (malformed input).
        while self._stack:
            top = self._stack.pop()
            if top != "__unwrap__":
                self._out.append(f"</{top}>")
        return "".join(self._out)


def sanitize_rich_html(html: str) -> str:
    text = str(html or "")
    if not text.strip():
        return ""
    parser = _RichHtmlSanitizer()
    try:
        parser.feed(text)
        parser.close()
    except Exception:  # noqa: BLE001 — malformed markup → empty
        return ""
    return parser.result().strip()


def check_rich_html_length(html: str, max_length: int) -> None:
    """Reject oversize content on write. Cutting it would silently drop the tail
    (and any media after the cut). Read paths must not call this: stored HTML
    may legitimately grow a little when re-sanitized."""
    if len(html) > max_length:
        raise RichHtmlTooLongError(max_length)


def rich_html_plain_text(html: str) -> str:
    """Strip tags for empty checks / previews."""
    if not html:
        return ""
    # Replace block boundaries with newlines roughly.
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"</(?:p|li|h[1-6])\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).replace("\xa0", " ").strip()


def rich_html_has_text(html: str) -> bool:
    return bool(rich_html_plain_text(html))


def _extract_uuid_attr_ids(html: str, pattern: re.Pattern[str]) -> tuple[str, ...]:
    if not html:
        return ()
    ordered: list[str] = []
    seen: set[str] = set()
    for match in pattern.finditer(html):
        media_id = match.group(1).strip()
        if not FILE_ID_RE.fullmatch(media_id):
            continue
        normalized = media_id.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return tuple(ordered)


def extract_file_ids(html: str) -> tuple[str, ...]:
    return _extract_uuid_attr_ids(html, MEDIA_ID_ATTR_RE)


def extract_image_ids(html: str) -> tuple[str, ...]:
    return _extract_uuid_attr_ids(html, IMAGE_ID_ATTR_RE)


def extract_media_ids(html: str) -> tuple[str, ...]:
    """Media ids referenced by stored HTML, in document order, deduplicated.

    Callers must pass sanitized HTML; `sanitize_rich_html` is what guarantees a
    `data-media-id` / `data-image-id` only survives next to a verified src/href.
    """
    return tuple(dict.fromkeys((*extract_file_ids(html), *extract_image_ids(html))))


def rich_html_has_content(html: str) -> bool:
    """Media-only bodies carry no text but are still content."""
    return rich_html_has_text(html) or bool(extract_media_ids(html))
