import pytest

from services.rich_text import (
    extract_media_ids,
    rich_html_has_content,
    rich_html_has_text,
    sanitize_rich_html,
)

MEDIA_ID = "12345678-1234-1234-1234-123456789abc"
OTHER_MEDIA_ID = "abcdef01-2345-6789-abcd-ef0123456789"
IMAGE_HTML = f'<img data-media-id="{MEDIA_ID}" src="/api/v1/media/files/{MEDIA_ID}" alt="photo">'
ATTACHMENT_HTML = (
    f'<a data-media-kind="attachment" data-media-id="{MEDIA_ID}" '
    'data-media-name="report.pdf" data-media-content-type="application/pdf" '
    f'data-media-size="12345" href="/api/v1/media/files/{MEDIA_ID}?download=true">report.pdf</a>'
)


def test_sanitize_keeps_owned_image_and_attachment():
    clean = sanitize_rich_html(f"<p>Before</p>{IMAGE_HTML}{ATTACHMENT_HTML}")
    assert f'data-media-id="{MEDIA_ID}"' in clean
    assert 'data-media-kind="attachment"' in clean
    assert 'alt="photo"' in clean


@pytest.mark.parametrize(
    ("width", "is_valid"),
    [("32", True), ("1200", True), ("31", False), ("1201", False), ("-1", False), ("40.5", False), ("40px", False), ("1e2", False), ("+40", False)],
)
def test_sanitize_validates_image_width(width, is_valid):
    clean = sanitize_rich_html(
        f'<img data-media-id="{MEDIA_ID}" data-media-width="{width}" '
        f'src="/api/v1/media/files/{MEDIA_ID}" alt="photo">'
    )
    assert (f'data-media-width="{width}"' in clean) is is_valid
    assert (f'width="{width}"' in clean) is is_valid


def test_sanitize_rejects_image_style_width_and_round_trips_metadata():
    clean = sanitize_rich_html(
        f'<img data-media-id="{MEDIA_ID}" data-media-width="400" '
        f'style="width: 9999px" src="/api/v1/media/files/{MEDIA_ID}" alt="photo">'
    )
    assert 'data-media-width="400"' in clean
    assert 'width="400"' in clean
    assert "style=" not in clean
    assert sanitize_rich_html(clean) == clean


def test_sanitize_preserves_attachment_metadata_across_round_trip():
    """Editor node views rebuild the download UI from these attributes."""
    once = sanitize_rich_html(ATTACHMENT_HTML)
    assert 'data-media-content-type="application/pdf"' in once
    assert 'data-media-size="12345"' in once
    assert sanitize_rich_html(once) == once


@pytest.mark.parametrize(
    "size_attr",
    ['data-media-size="-1"', 'data-media-size="abc"', 'data-media-size="1e9"'],
)
def test_sanitize_drops_invalid_attachment_size(size_attr):
    clean = sanitize_rich_html(
        f'<a data-media-kind="attachment" data-media-id="{MEDIA_ID}" '
        f'data-media-name="r.pdf" {size_attr} '
        f'href="/api/v1/media/files/{MEDIA_ID}?download=true">r.pdf</a>'
    )
    assert 'data-media-kind="attachment"' in clean
    assert "data-media-size" not in clean


def test_sanitize_drops_invalid_attachment_content_type():
    clean = sanitize_rich_html(
        f'<a data-media-kind="attachment" data-media-id="{MEDIA_ID}" '
        'data-media-name="r.pdf" data-media-content-type="javascript:alert(1)" '
        f'href="/api/v1/media/files/{MEDIA_ID}?download=true">r.pdf</a>'
    )
    assert "data-media-content-type" not in clean


def test_sanitize_drops_external_images_and_fake_media_attributes():
    clean = sanitize_rich_html(
        f'<img src="https://example.com/x.png" data-media-id="{MEDIA_ID}">'
        f'<span data-media-id="{MEDIA_ID}">text</span>'
    )
    assert "<img" not in clean
    assert "data-media-id" not in clean


@pytest.mark.parametrize(
    "media_id",
    ["----------------", "not-a-uuid", f"{MEDIA_ID}/../../etc"],
)
def test_sanitize_requires_uuid_media_id(media_id):
    clean = sanitize_rich_html(
        f'<img data-media-id="{media_id}" src="/api/v1/media/files/{media_id}">'
    )
    assert "<img" not in clean


def test_sanitize_drops_media_kind_on_non_anchor_tags():
    clean = sanitize_rich_html(
        f'<p data-media-kind="attachment" data-media-id="{MEDIA_ID}" '
        f'href="/api/v1/media/files/{MEDIA_ID}?download=true">x</p>'
    )
    assert clean == "<p>x</p>"


def test_sanitize_rejects_mismatched_media_url():
    clean = sanitize_rich_html(
        f'<img data-media-id="{MEDIA_ID}" '
        f'src="/api/v1/media/files/{OTHER_MEDIA_ID}">'
    )
    assert "<img" not in clean


def test_sanitize_accepts_optimized_image_reference():
    image_id = "aaaaaaaa-1234-1234-1234-123456789abc"
    clean = sanitize_rich_html(
        f'<img data-media-id="{MEDIA_ID}" data-image-id="{image_id}" '
        f'data-media-width="400" '
        f'src="/api/v1/media/images/{image_id}/display" alt="photo">'
    )
    assert f'data-media-id="{MEDIA_ID}"' in clean
    assert f'data-image-id="{image_id}"' in clean
    assert f'src="/api/v1/media/images/{image_id}/display"' in clean


def test_extract_media_ids_is_ordered_and_deduplicated():
    html = sanitize_rich_html(
        f"{ATTACHMENT_HTML}{IMAGE_HTML}"
        f'<img data-media-id="{OTHER_MEDIA_ID}" '
        f'src="/api/v1/media/files/{OTHER_MEDIA_ID}">'
    )
    assert extract_media_ids(html) == (MEDIA_ID, OTHER_MEDIA_ID)

    optimized = sanitize_rich_html(
        f'<img data-media-id="{MEDIA_ID}" data-image-id="{OTHER_MEDIA_ID}" '
        f'src="/api/v1/media/images/{OTHER_MEDIA_ID}/display" alt="photo">'
    )
    assert extract_media_ids(optimized) == (MEDIA_ID, OTHER_MEDIA_ID)


def test_extract_media_ids_ignores_unsanitized_fakes():
    assert extract_media_ids('<span data-media-id="../../secret">x</span>') == ()
    assert extract_media_ids("") == ()


def test_media_only_body_counts_as_content():
    body = sanitize_rich_html(f"<p>{IMAGE_HTML}</p>")
    assert rich_html_has_text(body) is False
    assert rich_html_has_content(body) is True


def test_empty_body_has_no_content():
    assert rich_html_has_content("<p></p>") is False
    assert rich_html_has_content("") is False
