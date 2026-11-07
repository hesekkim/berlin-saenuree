"""popup_rich_text legacy title→body migration (ticket 026/027)."""

from services.popup_rich_text import (
    migrate_popup_copy,
    plain_strings_to_html,
)
from services.rich_text import rich_html_has_text, rich_html_plain_text


def test_plain_migration_merges_title_and_body():
    html = plain_strings_to_html("Hello", "Line1\nLine2")
    assert "<strong>Hello</strong>" in html
    assert "<p>Line1</p>" in html
    assert "<p>Line2</p>" in html
    assert rich_html_plain_text(html) == "Hello\nLine1\nLine2"


def test_migrate_popup_copy_legacy_and_html():
    legacy = migrate_popup_copy({"title": "Hi", "body": "There"})
    assert "title" not in legacy
    assert rich_html_has_text(legacy["body"])
    assert "Hi" in legacy["body"]

    already = migrate_popup_copy(
        {"body": '<p style="text-align: center">Ok</p><script>x</script>'}
    )
    assert "<script" not in already["body"].lower()
    assert "text-align: center" in already["body"]
    assert "Ok" in already["body"]
