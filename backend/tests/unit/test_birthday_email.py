import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json

import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import get_current_cms_user
from core.config import settings
from main import app
from models.cms import ChurchMemberCreateRequest
from services import birthday_email_service
from services.birthday_email_service import (
    get_birthday_email_settings,
    last_sunday_of_month,
    next_month_birthday_target,
    run_monthly_birthday_email,
)
from services.church_members_service import create_church_member


ADMIN = "admin@example.com"


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", [ADMIN])
    monkeypatch.setattr(settings, "send_real_email", True)
    monkeypatch.setattr(settings, "smtp_username", "smtp-user")
    monkeypatch.setattr(settings, "smtp_password", "smtp-password")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    return tmp_path


def _user(role: str) -> dict:
    return {
        "email": f"{role}@example.com",
        "name": role,
        "role": role,
        "pages": ["members"] if role == "page_admin" else [],
        "effectivePages": ["members"] if role == "page_admin" else [],
        "adminLanguage": "en",
        "darkMode": None,
    }


def _client_as(role: str) -> TestClient:
    app.dependency_overrides[get_current_cms_user] = lambda: _user(role)
    return TestClient(app)


def _save_settings(enabled: bool = True, recipients: list[str] | None = None) -> None:
    birthday_email_service.update_birthday_email_settings(
        enabled=enabled,
        recipients=recipients or [],
    )


def _last_sunday(year: int, month: int) -> datetime:
    day = last_sunday_of_month(year, month)
    return datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc)


def _add_member(name: str, birth_date: str, email: str | None = None) -> None:
    create_church_member(
        ChurchMemberCreateRequest(
            name=name,
            birthDate=birth_date,
            email=email,
            phone="+49 30 1234567",
        )
    )


def test_last_sunday_and_next_month_target_cross_year_and_berlin_dst():
    assert last_sunday_of_month(2026, 1).isoformat() == "2026-01-25"
    assert last_sunday_of_month(2026, 2).isoformat() == "2026-02-22"
    assert next_month_birthday_target(_last_sunday(2026, 12)) == "2027-01"
    assert next_month_birthday_target(_last_sunday(2027, 1)) == "2027-02"

    before_berlin_midnight = datetime(2026, 3, 28, 22, 30, tzinfo=timezone.utc)
    on_berlin_last_sunday = datetime(2026, 3, 29, 1, 30, tzinfo=timezone.utc)
    assert next_month_birthday_target(before_berlin_midnight) is None
    assert next_month_birthday_target(on_berlin_last_sunday) == "2026-04"


def test_birthday_email_settings_normalize_and_are_site_admin_only(isolated_data):
    admin = _client_as("site_admin")
    try:
        updated = admin.put(
            "/api/v1/admin/members/birthday-email",
            json={
                "enabled": True,
                "recipients": [
                    "  FIRST@example.com ",
                    "first@EXAMPLE.com",
                    "",
                    "second@example.com",
                ],
            },
        )
        assert updated.status_code == 200
        assert updated.json()["recipients"] == [
            "first@example.com",
            "second@example.com",
        ]
        assert admin.get(
            "/api/v1/admin/members/birthday-email"
        ).json()["enabled"] is True
        assert admin.put(
            "/api/v1/admin/members/birthday-email",
            json={"enabled": True, "recipients": ["not-an-email"]},
        ).status_code == 422
        store = json.loads(settings.birthday_email_file.read_text(encoding="utf-8"))
        store["deliveries"]["2027-02"] = {
            "month": "2027-02",
            "status": "failed",
            "attemptedAt": "2027-01-31T12:00:00+01:00",
            "recipientCount": 2,
            "failedRecipientCount": 1,
            "recipients": [
                "first@example.com",
                "private-recipient@example.com",
            ],
            "sentRecipients": ["first@example.com"],
            "failedRecipients": ["private-recipient@example.com"],
            "error": "smtp_delivery_failed",
        }
        settings.birthday_email_file.write_text(
            json.dumps(store),
            encoding="utf-8",
        )
        assert admin.get(
            "/api/v1/admin/members/birthday-email/status"
        ).status_code == 200
    finally:
        app.dependency_overrides.clear()

    page_admin = _client_as("page_admin")
    try:
        status_response = page_admin.get(
            "/api/v1/admin/members/birthday-email/status"
        )
        assert status_response.status_code == 200
        assert "recipients" not in status_response.json()
        assert (
            status_response.json()["deliveryHistory"][0]["failedRecipientCount"]
            == 1
        )
        delivery = status_response.json()["deliveryHistory"][0]
        assert delivery["recipients"] == [
            "first@example.com",
            "private-recipient@example.com",
        ]
        assert delivery["sentRecipients"] == ["first@example.com"]
        assert delivery["failedRecipients"] == ["private-recipient@example.com"]
        assert page_admin.get(
            "/api/v1/admin/members/birthday-email"
        ).status_code == 403
        assert page_admin.put(
            "/api/v1/admin/members/birthday-email",
            json={"enabled": True, "recipients": ["person@example.com"]},
        ).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_monthly_email_sends_only_birthday_names_and_dates_once(
    isolated_data, monkeypatch
):
    _save_settings(
        recipients=["first@example.com", "second@example.com"],
    )
    _add_member("February Member", "1987-02-03", "private@example.com")
    _add_member("March Member", "1987-03-04", "other@example.com")
    sent: list[dict] = []

    async def fake_send(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(birthday_email_service, "send_birthday_email", fake_send)
    now = _last_sunday(2027, 1)

    run_monthly_birthday_email(now=now)
    run_monthly_birthday_email(now=now)

    assert [message["to_email"] for message in sent] == [
        "first@example.com",
        "second@example.com",
    ]
    for message in sent:
        assert message["text_content"] == "February Member - 03.02."
        assert "private@example.com" not in message["text_content"]
        assert "+49 30 1234567" not in message["text_content"]
        assert "March Member" not in message["text_content"]
        assert "private@example.com" not in message["html_content"]
    assert get_birthday_email_settings()["lastDelivery"]["status"] == "sent"
    assert get_birthday_email_settings()["lastDelivery"]["recipients"] == [
        "first@example.com",
        "second@example.com",
    ]
    assert get_birthday_email_settings()["lastDelivery"]["sentRecipients"] == [
        "first@example.com",
        "second@example.com",
    ]


@pytest.mark.parametrize(
    ("enabled", "recipients"),
    [(False, ["one@example.com"]), (True, [])],
)
def test_disabled_or_unaddressed_settings_do_not_send(
    isolated_data, monkeypatch, enabled, recipients
):
    _save_settings(enabled, recipients)
    _add_member("Birthday Member", "1987-02-03")
    monkeypatch.setattr(
        birthday_email_service,
        "send_birthday_email",
        lambda **_kwargs: pytest.fail("Email must not be sent"),
    )

    run_monthly_birthday_email(now=_last_sunday(2027, 1))

    assert get_birthday_email_settings()["lastDelivery"] is None


def test_no_birthdays_does_not_send(isolated_data, monkeypatch):
    _save_settings(recipients=["one@example.com"])
    monkeypatch.setattr(
        birthday_email_service,
        "send_birthday_email",
        lambda **_kwargs: pytest.fail("Email must not be sent"),
    )

    run_monthly_birthday_email(now=_last_sunday(2027, 1))

    assert get_birthday_email_settings()["lastDelivery"] is None


def test_failed_send_is_recorded_and_not_retried(isolated_data, monkeypatch):
    _save_settings(recipients=["failed@example.com"])
    _add_member("Birthday Member", "1987-02-03")
    attempts: list[str] = []

    async def failed_send(**kwargs):
        attempts.append(kwargs["to_email"])
        return False

    monkeypatch.setattr(birthday_email_service, "send_birthday_email", failed_send)
    now = _last_sunday(2027, 1)

    run_monthly_birthday_email(now=now)
    run_monthly_birthday_email(now=now)

    delivery = get_birthday_email_settings()["lastDelivery"]
    assert attempts == ["failed@example.com"]
    assert delivery["status"] == "failed"
    assert delivery["error"] == "smtp_delivery_failed"
    assert delivery["sentRecipients"] == []
    assert delivery["failedRecipients"] == ["failed@example.com"]


def test_partial_delivery_records_successful_and_failed_recipients(
    isolated_data, monkeypatch
):
    _save_settings(recipients=["sent@example.com", "failed@example.com"])
    _add_member("Birthday Member", "1987-02-03")

    async def partially_successful_send(**kwargs):
        return kwargs["to_email"] == "sent@example.com"

    monkeypatch.setattr(
        birthday_email_service,
        "send_birthday_email",
        partially_successful_send,
    )

    run_monthly_birthday_email(now=_last_sunday(2027, 1))

    delivery = get_birthday_email_settings()["lastDelivery"]
    assert delivery["recipients"] == ["sent@example.com", "failed@example.com"]
    assert delivery["sentRecipients"] == ["sent@example.com"]
    assert delivery["failedRecipients"] == ["failed@example.com"]


def test_concurrent_runs_claim_the_monthly_delivery_once(
    isolated_data, monkeypatch
):
    _save_settings(recipients=["one@example.com"])
    _add_member("Birthday Member", "1987-02-03")
    attempts: list[str] = []

    async def successful_send(**kwargs):
        attempts.append(kwargs["to_email"])
        await asyncio.sleep(0.05)
        return True

    monkeypatch.setattr(
        birthday_email_service, "send_birthday_email", successful_send
    )
    now = _last_sunday(2027, 1)
    with ThreadPoolExecutor(max_workers=2) as executor:
        runs = [
            executor.submit(run_monthly_birthday_email, now=now)
            for _ in range(2)
        ]
        for run in runs:
            run.result()

    assert attempts == ["one@example.com"]
    assert get_birthday_email_settings()["lastDelivery"]["status"] == "sent"


def test_missing_smtp_configuration_is_visible_as_failed(
    isolated_data, monkeypatch
):
    _save_settings(recipients=["one@example.com"])
    _add_member("Birthday Member", "1987-02-03")
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(
        birthday_email_service,
        "send_birthday_email",
        lambda **_kwargs: pytest.fail("SMTP must not be used when unconfigured"),
    )

    run_monthly_birthday_email(now=_last_sunday(2027, 1))

    delivery = get_birthday_email_settings()["lastDelivery"]
    assert delivery["status"] == "failed"
    assert delivery["error"] == "smtp_not_configured"
    assert delivery["failedRecipients"] == ["one@example.com"]


def test_monthly_delivery_record_survives_restart(isolated_data, monkeypatch):
    _save_settings(recipients=["one@example.com"])
    _add_member("Birthday Member", "1987-02-03")

    async def successful_send(**_kwargs):
        return True

    monkeypatch.setattr(
        birthday_email_service, "send_birthday_email", successful_send
    )
    now = _last_sunday(2027, 1)
    run_monthly_birthday_email(now=now)
    saved_record = json.loads(settings.birthday_email_file.read_text(encoding="utf-8"))

    assert saved_record["deliveries"]["2027-02"]["status"] == "sent"
    run_monthly_birthday_email(now=now)
    persisted_record = json.loads(
        settings.birthday_email_file.read_text(encoding="utf-8")
    )
    assert persisted_record == saved_record


def test_delivery_history_is_limited_to_the_latest_twelve_months(isolated_data):
    months = [
        *(f"2025-{month:02d}" for month in range(1, 13)),
        "2026-01",
        "2026-02",
        "2026-03",
    ]
    deliveries = {
        month: {
            "month": month,
            "status": "sent",
            "attemptedAt": f"{month}-01T12:00:00+01:00",
            "recipientCount": 1,
            "failedRecipientCount": 0,
            "failedRecipients": [],
            "error": None,
        }
        for month in months
    }
    settings.birthday_email_file.write_text(
        json.dumps(
            {
                "enabled": True,
                "recipients": ["one@example.com"],
                "deliveries": deliveries,
            }
        ),
        encoding="utf-8",
    )

    birthday_email_service.update_birthday_email_settings(
        enabled=True,
        recipients=["one@example.com"],
    )

    stored = json.loads(settings.birthday_email_file.read_text(encoding="utf-8"))
    assert len(stored["deliveries"]) == 12
    assert "2025-03" not in stored["deliveries"]
    assert "2025-04" in stored["deliveries"]
    assert len(get_birthday_email_settings()["deliveryHistory"]) == 12
