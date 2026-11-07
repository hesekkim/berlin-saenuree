"""Popup notice rich-text migration (legacy title+plain → HTML).

Sanitize / link / empty checks live in `services.rich_text`.
"""

from __future__ import annotations

from html import escape
from typing import Any

from services.rich_text import (
    check_rich_html_length,
    looks_like_html,
    rich_html_has_text,
    sanitize_rich_html,
)


def plain_strings_to_html(title: str, body: str) -> str:
    """Migrate legacy plain title + body into paragraph HTML."""
    parts: list[str] = []
    title_text = str(title or "").strip()
    if title_text:
        parts.append(f"<p><strong>{escape(title_text)}</strong></p>")
    body_text = str(body or "")
    if body_text:
        for line in body_text.split("\n"):
            parts.append(f"<p>{escape(line)}</p>")
    return sanitize_rich_html("".join(parts))


def migrate_popup_copy(
    value: dict[str, Any], *, max_length: int | None = None
) -> dict[str, str]:
    """Normalize a language copy to `{ body: sanitizedHtml }`.

    Pass `max_length` on write paths only; reads of stored copies must not reject.
    """
    body_raw = value.get("body")
    title_raw = value.get("title")
    title = str(title_raw or "").strip()
    body = "" if body_raw is None else str(body_raw)

    if looks_like_html(body):
        sanitized = sanitize_rich_html(body)
        if title and not rich_html_has_text(sanitized):
            sanitized = plain_strings_to_html(title, "")
    else:
        sanitized = plain_strings_to_html(title, body)

    if max_length is not None:
        check_rich_html_length(sanitized, max_length)
    return {"body": sanitized}


def copy_has_text(copy: object) -> bool:
    if not isinstance(copy, dict):
        return False
    body = copy.get("body")
    if isinstance(body, str):
        if looks_like_html(body) or "<" in body:
            return rich_html_has_text(body)
        return bool(body.strip()) or bool(str(copy.get("title") or "").strip())
    return bool(str(copy.get("title") or "").strip())
