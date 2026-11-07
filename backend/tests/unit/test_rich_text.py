"""Shared rich_text sanitize + link normalization (ticket 027)."""

import pytest

from services.rich_text import (
    MAX_RICH_HTML_LENGTH,
    RichHtmlTooLongError,
    check_rich_html_length,
    normalize_link_url,
    rich_html_has_text,
    rich_html_plain_text,
    sanitize_rich_html,
)


def test_sanitize_strips_disallowed_markup_and_bad_links():
    dirty = (
        '<p onclick="alert(1)">Safe</p>'
        '<a href="javascript:alert(1)">Bad</a>'
        '<a href="https://example.com">Good</a>'
        '<span style="color: #ff0000; position: absolute">Red</span>'
    )
    clean = sanitize_rich_html(dirty)
    assert "onclick" not in clean
    assert "javascript:" not in clean
    assert 'href="https://example.com/"' in clean or 'href="https://example.com"' in clean
    assert 'target="_blank"' in clean
    assert "color: #ff0000" in clean
    assert "position" not in clean
    assert rich_html_has_text(clean)


def test_sanitize_keeps_rgb_and_inline_mark_colors():
    rgb = sanitize_rich_html('<p><span style="color: rgb(224, 50, 50)">Red</span></p>')
    assert "color: #e03232" in rgb
    strong = sanitize_rich_html(
        '<p><strong style="color: #0f8a0f">Green</strong></p>'
    )
    assert "color: #0f8a0f" in strong


def test_sanitize_empty_and_blank_paragraphs():
    assert sanitize_rich_html("") == ""
    assert not rich_html_has_text("<p></p>")
    assert not rich_html_has_text("<p><br></p>")
    assert rich_html_plain_text("<p>Hi</p>") == "Hi"


def test_sanitize_never_truncates_stored_html():
    html = "<p>" + ("x" * (MAX_RICH_HTML_LENGTH + 100)) + "</p>"
    clean = sanitize_rich_html(html)
    assert clean == html


def test_check_rich_html_length_accepts_exact_limit():
    check_rich_html_length("x" * MAX_RICH_HTML_LENGTH, MAX_RICH_HTML_LENGTH)


def test_check_rich_html_length_rejects_over_limit():
    with pytest.raises(RichHtmlTooLongError, match="Content is too long"):
        check_rich_html_length("x" * (MAX_RICH_HTML_LENGTH + 1), MAX_RICH_HTML_LENGTH)


def test_normalize_link_url_matches_editor_rules():
    assert normalize_link_url("example.com") == "https://example.com"
    assert normalize_link_url("https://example.com/path") == "https://example.com/path"
    assert normalize_link_url("123") is None
    assert normalize_link_url("javascript:alert(1)") is None
    assert normalize_link_url("localhost") == "https://localhost"
