import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from core.config import settings
from main import app
from services import auth_service
from services.auth_service import OtpThrottledError

ADMIN = "admin@example.com"
STRANGER = "stranger@example.com"
WRONG_CODE = "000000"


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock(monkeypatch):
    fake = FakeClock()
    monkeypatch.setattr(auth_service, "_utc_now", fake)
    return fake


@pytest.fixture
def mailbox(monkeypatch):
    sent: list[tuple[str, str]] = []

    async def fake_send(to_email: str, code: str) -> bool:
        sent.append((to_email, code))
        return True

    monkeypatch.setattr(auth_service, "send_verification_email", fake_send)
    return sent


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", [ADMIN])
    monkeypatch.setattr(settings, "page_admin_enabled", True)
    monkeypatch.setattr(settings, "debug", True)
    return tmp_path


def _send(email: str = ADMIN, *, allowed: bool = True) -> bool:
    return asyncio.run(auth_service.send_verification_code(email, allowed=allowed))


def _fail_verifications(email: str, count: int) -> None:
    for _ in range(count):
        assert auth_service.verify_code(email, WRONG_CODE) is False


def test_resend_is_blocked_during_cooldown_then_allowed(isolated_data, clock, mailbox):
    _send()

    clock.advance(30)
    with pytest.raises(OtpThrottledError) as raised:
        _send()
    assert raised.value.retry_after_seconds == 30
    assert len(mailbox) == 1

    clock.advance(31)
    _send()
    assert len(mailbox) == 2


def test_hourly_send_cap(isolated_data, clock, mailbox):
    for _ in range(auth_service.MAX_SENDS_PER_WINDOW):
        _send()
        clock.advance(auth_service.RESEND_COOLDOWN_SECONDS + 1)

    with pytest.raises(OtpThrottledError) as raised:
        _send()
    assert raised.value.retry_after_seconds > auth_service.RESEND_COOLDOWN_SECONDS
    assert len(mailbox) == auth_service.MAX_SENDS_PER_WINDOW

    clock.advance(auth_service.SEND_WINDOW_SECONDS)
    _send()
    assert len(mailbox) == auth_service.MAX_SENDS_PER_WINDOW + 1


def test_guesses_per_hour_are_bounded_by_send_cap_times_code_attempts(
    isolated_data, clock, mailbox
):
    guesses = 0
    for _ in range(auth_service.MAX_SENDS_PER_WINDOW):
        _send()
        _fail_verifications(ADMIN, auth_service.MAX_VERIFY_ATTEMPTS)
        guesses += auth_service.MAX_VERIFY_ATTEMPTS
        clock.advance(auth_service.RESEND_COOLDOWN_SECONDS + 1)

    assert guesses == 25
    with pytest.raises(OtpThrottledError):
        _send()


def test_code_is_void_after_max_wrong_guesses(isolated_data, clock, mailbox):
    _send()
    issued_code = mailbox[-1][1]
    _fail_verifications(ADMIN, auth_service.MAX_VERIFY_ATTEMPTS)

    assert auth_service.verify_code(ADMIN, issued_code) is False


def test_wrong_guesses_do_not_lock_out_the_correct_code(isolated_data, clock, mailbox):
    _send()
    issued_code = mailbox[-1][1]
    _fail_verifications(ADMIN, auth_service.MAX_VERIFY_ATTEMPTS - 1)

    assert auth_service.verify_code(ADMIN, issued_code) is True


def test_successful_login_clears_send_history(isolated_data, clock, mailbox):
    _send()
    assert auth_service.verify_code(ADMIN, mailbox[-1][1]) is True

    assert auth_service._load_verification_codes() == {}
    _send()
    assert len(mailbox) == 2


def test_unauthorized_email_gets_no_code_and_no_mail(isolated_data, clock, mailbox):
    _send(STRANGER, allowed=False)

    assert mailbox == []
    record = auth_service._load_verification_codes()[STRANGER]
    assert "code" not in record
    assert record["allowed"] is False


def test_unauthorized_email_is_throttled_like_an_authorized_one(
    isolated_data, clock, mailbox
):
    _send(STRANGER, allowed=False)
    with pytest.raises(OtpThrottledError):
        _send(STRANGER, allowed=False)


def test_unauthorized_email_never_verifies(isolated_data, clock):
    auth_service._store_verification_code(STRANGER, "123456")

    assert auth_service.verify_code(STRANGER, "123456", allowed=False) is False
    assert auth_service.verify_code(STRANGER, WRONG_CODE, allowed=False) is False


def test_non_ascii_code_is_rejected_without_error(isolated_data, clock, mailbox):
    _send()

    assert auth_service.verify_code(ADMIN, "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9") is False


def test_email_sent_flag_does_not_leak_delivery_outside_debug(
    isolated_data, clock, monkeypatch
):
    async def failing_send(to_email: str, code: str) -> bool:
        return False

    monkeypatch.setattr(auth_service, "send_verification_email", failing_send)

    monkeypatch.setattr(settings, "debug", True)
    assert _send() is False

    clock.advance(auth_service.RESEND_COOLDOWN_SECONDS + 1)
    monkeypatch.setattr(settings, "debug", False)
    assert _send() is True


def test_unauthorized_records_are_bounded_and_authorized_ones_survive(
    isolated_data, clock, mailbox, monkeypatch
):
    monkeypatch.setattr(auth_service, "MAX_TRACKED_EMAILS", 3)
    _send(ADMIN)
    for index in range(6):
        clock.advance(1)
        _send(f"stranger{index}@example.com", allowed=False)

    tracked = auth_service._load_verification_codes()
    assert len(tracked) == 3
    assert ADMIN in tracked
    assert "stranger5@example.com" in tracked


def test_legacy_record_without_throttle_fields_still_verifies(isolated_data, clock):
    expires_at = (clock.now + timedelta(minutes=5)).isoformat()
    auth_service._save_verification_codes(
        {ADMIN: {"code": "123456", "expires_at": expires_at, "attempts": 0}}
    )

    assert auth_service.verify_code(ADMIN, "123456") is True


def test_legacy_failure_fields_are_dropped_on_load(isolated_data, clock):
    expires_at = (clock.now + timedelta(minutes=5)).isoformat()
    auth_service._save_verification_codes(
        {
            ADMIN: {
                "code": "123456",
                "expires_at": expires_at,
                "attempts": 1,
                "failed_at": [clock.now.timestamp()] * 20,
            }
        }
    )

    assert auth_service._load_verification_codes() == {
        ADMIN: {"code": "123456", "expires_at": expires_at, "attempts": 1}
    }


def test_corrupt_codes_file_starts_empty_instead_of_failing(isolated_data, clock, mailbox):
    path = settings.verification_codes_file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{", encoding="utf-8")

    _send()

    assert len(mailbox) == 1


@pytest.fixture
def client():
    return TestClient(app)


def test_send_code_response_is_identical_for_authorized_and_unauthorized_emails(
    isolated_data, mailbox, client, monkeypatch
):
    monkeypatch.setattr(settings, "send_real_email", True)
    authorized = client.post("/api/v1/auth/send-code", json={"email": ADMIN})
    unauthorized = client.post("/api/v1/auth/send-code", json={"email": STRANGER})

    assert authorized.status_code == unauthorized.status_code == 200
    assert {**authorized.json(), "email": ""} == {**unauthorized.json(), "email": ""}
    assert [to for to, _ in mailbox] == [ADMIN]


def test_verify_code_returns_401_for_unauthorized_email(isolated_data, client):
    response = client.post(
        "/api/v1/auth/verify-code", json={"email": STRANGER, "code": "123456"}
    )

    assert response.status_code == 401


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", "\u0663\u0663\u0663\u0663\u0663\u0663", "12345\n", ""])
def test_verify_code_rejects_malformed_codes_with_422(isolated_data, client, code):
    response = client.post(
        "/api/v1/auth/verify-code", json={"email": ADMIN, "code": code}
    )

    assert response.status_code == 422


def test_send_code_during_cooldown_returns_429_with_retry_after(
    isolated_data, mailbox, client
):
    assert client.post("/api/v1/auth/send-code", json={"email": ADMIN}).status_code == 200

    response = client.post("/api/v1/auth/send-code", json={"email": ADMIN})

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= auth_service.RESEND_COOLDOWN_SECONDS
    assert "Try again in" in response.json()["detail"]


def test_wrong_codes_over_the_api_never_return_429(isolated_data, mailbox, client):
    _send()

    statuses = [
        client.post(
            "/api/v1/auth/verify-code", json={"email": ADMIN, "code": WRONG_CODE}
        ).status_code
        for _ in range(auth_service.MAX_VERIFY_ATTEMPTS * 3)
    ]

    assert set(statuses) == {401}
