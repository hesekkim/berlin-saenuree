"""Shared JSON file persistence: atomic writes and fail-closed reads.

Writers must never replace a file they could not parse. A truncated or
hand-edited file raises `JsonStoreCorruptError` so read-modify-write code
aborts instead of overwriting recoverable data with an empty store.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


class JsonStoreCorruptError(RuntimeError):
    """A JSON data file exists but cannot be trusted."""

    def __init__(self, path: Path, reason: str) -> None:
        super().__init__(f"JSON store is unreadable ({path.name}): {reason}")
        self.path = path
        self.reason = reason


def atomic_write_json(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temporary_file:
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, path)
    except Exception:
        try:
            os.unlink(temporary_path)
        except OSError:
            pass
        raise


def write_json_store(path: Path, data: Any) -> None:
    atomic_write_json(path, json.dumps(data, ensure_ascii=False, indent=2))


def read_json_store(path: Path) -> Any | None:
    """Return parsed JSON, or None when the file does not exist.

    Raises `JsonStoreCorruptError` when the file exists but cannot be read or parsed.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except (OSError, UnicodeDecodeError) as error:
        raise JsonStoreCorruptError(path, str(error)) from error
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise JsonStoreCorruptError(path, f"invalid JSON ({error})") from error
    if payload is None:
        raise JsonStoreCorruptError(path, "JSON null is not a valid store")
    return payload


def read_keyed_list(path: Path, key: str) -> list[Any]:
    """Read `{key: [...]}` stores. Missing file or missing key means empty.

    Raises `JsonStoreCorruptError` for any other shape.
    """
    payload = read_json_store(path)
    if payload is None:
        return []
    if not isinstance(payload, dict):
        raise JsonStoreCorruptError(path, "expected a JSON object")
    items = payload.get(key, [])
    if not isinstance(items, list):
        raise JsonStoreCorruptError(path, f"'{key}' must be a list")
    return items
