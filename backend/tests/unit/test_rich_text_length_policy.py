import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.config import settings
from main import create_application
from services import blogger_service, popup_rich_text, posts_service
from services.rich_text import (
    MAX_BLOGGER_RICH_HTML_LENGTH,
    MAX_RICH_HTML_LENGTH,
    RichHtmlTooLongError,
)


def _text(length: int) -> str:
    return "x" * length


def test_posts_caption_over_limit_is_rejected_on_write():
    with pytest.raises(RichHtmlTooLongError):
        posts_service._normalize_copies(
            {"ko": {"body": _text(MAX_RICH_HTML_LENGTH + 1)}},
            max_length=MAX_RICH_HTML_LENGTH,
        )


def test_stored_caption_over_limit_is_still_read_intact():
    copies = posts_service._normalize_copies(
        {"ko": {"body": _text(MAX_RICH_HTML_LENGTH + 1)}},
    )

    assert len(copies["ko"]["body"]) == MAX_RICH_HTML_LENGTH + 1


def test_blogger_body_allows_length_beyond_short_text_limit():
    copies = blogger_service._normalize_copies(
        {"ko": {"title": "t", "body": f"<p>{_text(MAX_RICH_HTML_LENGTH * 3)}</p>"}},
        max_length=MAX_BLOGGER_RICH_HTML_LENGTH,
    )

    assert len(copies["ko"]["body"]) > MAX_RICH_HTML_LENGTH


def test_blogger_body_over_blogger_limit_is_rejected():
    with pytest.raises(RichHtmlTooLongError):
        blogger_service._normalize_copies(
            {"ko": {"title": "t", "body": _text(MAX_BLOGGER_RICH_HTML_LENGTH + 1)}},
            max_length=MAX_BLOGGER_RICH_HTML_LENGTH,
        )


def test_popup_body_over_limit_is_rejected_on_write():
    with pytest.raises(RichHtmlTooLongError):
        popup_rich_text.migrate_popup_copy(
            {"body": _text(MAX_RICH_HTML_LENGTH + 1)},
            max_length=MAX_RICH_HTML_LENGTH,
        )


def test_too_long_rich_text_returns_400_with_reason(monkeypatch):
    monkeypatch.setattr(settings, "debug", True)
    application: FastAPI = create_application()

    @application.get("/_test/too-long")
    def raise_too_long() -> None:
        raise RichHtmlTooLongError(MAX_RICH_HTML_LENGTH)

    client = TestClient(application)
    response = client.get("/_test/too-long")

    assert response.status_code == 400
    assert response.json() == {"detail": "Content is too long"}
