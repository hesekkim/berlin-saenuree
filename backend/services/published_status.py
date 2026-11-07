from __future__ import annotations

from typing import Any


def read_published(raw: dict[str, Any], *, default: bool = True) -> bool:
    value = raw.get("published")
    if isinstance(value, bool):
        return value
    legacy_value = raw.get("enabled")
    if isinstance(legacy_value, bool):
        return legacy_value
    return default


def normalize_published(raw: dict[str, Any], *, default: bool = True) -> bool:
    published = read_published(raw, default=default)
    raw["published"] = published
    raw.pop("enabled", None)
    return published
