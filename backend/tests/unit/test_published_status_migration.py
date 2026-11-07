import json

from services.published_status import normalize_published


def test_published_takes_precedence_and_removes_legacy_key():
    record = {"published": False, "enabled": True}

    assert normalize_published(record) is False
    assert record == {"published": False}


def test_enabled_is_migrated_without_truthy_coercion():
    record = {"enabled": False}

    assert normalize_published(record) is False
    assert record == {"published": False}


def test_invalid_status_uses_explicit_default():
    record = {"enabled": "false"}

    assert normalize_published(record, default=True) is True
    assert record == {"published": True}
