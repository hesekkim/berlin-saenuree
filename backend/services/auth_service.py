import json
import logging
import math
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt

from core.config import settings
from core.json_store import JsonStoreCorruptError, atomic_write_json, read_json_store
from services.email_service import send_verification_email

logger = logging.getLogger(__name__)

MAX_VERIFY_ATTEMPTS = 5
CODE_TTL_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 60
MAX_SENDS_PER_WINDOW = 5
SEND_WINDOW_SECONDS = 60 * 60
MAX_TRACKED_EMAILS = 500
JWT_AUDIENCE = "cms"
JWT_TOKEN_TYPE = "access"
JWT_REQUIRED_CLAIMS = ["exp", "iat", "sub", "iss", "aud"]

_CODES_LOCK = threading.RLock()


class OtpThrottledError(Exception):
    def __init__(self, retry_after_seconds: float) -> None:
        super().__init__("Too many login attempts")
        self.retry_after_seconds = max(1, math.ceil(retry_after_seconds))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_expires_at(value: str) -> datetime:
    expires_at = datetime.fromisoformat(value)
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=timezone.utc)
    return expires_at


def _recent_timestamps(raw: object, cutoff: float) -> list[float]:
    if not isinstance(raw, list):
        return []
    return sorted(
        float(item)
        for item in raw
        if isinstance(item, (int, float))
        and not isinstance(item, bool)
        and item > cutoff
    )


def _prune_record(raw: object, now: float) -> dict[str, Any] | None:
    """Drop expired codes and aged-out send history; None when nothing is left."""
    if not isinstance(raw, dict):
        return None
    record: dict[str, Any] = {}

    code = raw.get("code")
    expires_raw = raw.get("expires_at")
    if isinstance(code, str) and isinstance(expires_raw, str):
        try:
            code_is_live = _parse_expires_at(expires_raw).timestamp() > now
        except ValueError:
            code_is_live = False
        if code_is_live:
            try:
                attempts = int(raw.get("attempts", 0))
            except (TypeError, ValueError):
                attempts = 0
            record.update(code=code, expires_at=expires_raw, attempts=attempts)

    sent_at = _recent_timestamps(raw.get("sent_at"), now - SEND_WINDOW_SECONDS)
    if sent_at:
        record["sent_at"] = sent_at
    if not record:
        return None
    if raw.get("allowed") is False:
        record["allowed"] = False
    return record


def _load_verification_codes() -> dict:
    try:
        data = read_json_store(settings.verification_codes_file)
    except JsonStoreCorruptError as error:
        logger.error("Failed to load verification codes: %s", error)
        return {}
    if not isinstance(data, dict):
        return {}

    now = _utc_now().timestamp()
    cleaned: dict[str, dict[str, Any]] = {}
    for email, raw in data.items():
        record = _prune_record(raw, now)
        if record is not None:
            cleaned[email] = record

    if cleaned != data:
        _save_verification_codes(cleaned)
    return cleaned


def _save_verification_codes(codes: dict) -> None:
    try:
        atomic_write_json(
            settings.verification_codes_file,
            json.dumps(codes, ensure_ascii=False, indent=2, default=str),
        )
    except (IOError, OSError) as e:
        logger.error("Failed to save verification codes: %s", e)


def _generate_verification_code() -> str:
    return f"{secrets.randbelow(900000) + 100000:06d}"


def _last_send(record: dict[str, Any]) -> float:
    return max(record.get("sent_at", []), default=0.0)


def _evict_overflow(codes: dict[str, dict[str, Any]], keep: str) -> None:
    """Unauthorized emails are tracked too (uniform responses); bound that growth."""
    while len(codes) > MAX_TRACKED_EMAILS:
        evictable = [
            email
            for email, record in codes.items()
            if email != keep and record.get("allowed") is False
        ]
        if not evictable:
            return
        del codes[min(evictable, key=lambda email: _last_send(codes[email]))]


def _assert_can_send(record: dict[str, Any], now: float) -> None:
    sent_at = record.get("sent_at", [])
    if sent_at and now - sent_at[-1] < RESEND_COOLDOWN_SECONDS:
        raise OtpThrottledError(sent_at[-1] + RESEND_COOLDOWN_SECONDS - now)
    if len(sent_at) >= MAX_SENDS_PER_WINDOW:
        raise OtpThrottledError(
            sent_at[-MAX_SENDS_PER_WINDOW] + SEND_WINDOW_SECONDS - now
        )


def _issue_code_fields(code: str, expires_in_minutes: int) -> dict[str, Any]:
    expires_at = _utc_now() + timedelta(minutes=expires_in_minutes)
    return {"code": code, "expires_at": expires_at.isoformat(), "attempts": 0}


def _store_verification_code(
    email: str,
    code: str,
    expires_in_minutes: int = CODE_TTL_MINUTES,
) -> None:
    with _CODES_LOCK:
        codes = _load_verification_codes()
        record = {**codes.get(email, {}), **_issue_code_fields(code, expires_in_minutes)}
        record.pop("allowed", None)
        codes[email] = record
        _save_verification_codes(codes)

    if settings.debug:
        logger.info("Verification code stored for %s: %s", email, code)
    else:
        logger.info("Verification code stored for %s", email)


def _reserve_send(email: str, *, allowed: bool) -> str | None:
    """Apply send throttles and record the send. Returns the new code for allowed emails."""
    now = _utc_now().timestamp()
    with _CODES_LOCK:
        codes = _load_verification_codes()
        record = dict(codes.get(email, {}))
        _assert_can_send(record, now)

        record["sent_at"] = [*record.get("sent_at", []), now]
        code: str | None = None
        if allowed:
            code = _generate_verification_code()
            record.update(_issue_code_fields(code, CODE_TTL_MINUTES))
            record.pop("allowed", None)
        else:
            record["allowed"] = False

        codes[email] = record
        _evict_overflow(codes, keep=email)
        _save_verification_codes(codes)
        return code


def _public_email_sent(actual: bool) -> bool:
    """Outside debug mode the response must not reveal delivery or authorization."""
    return actual if settings.debug else True


async def send_verification_code(email: str, *, allowed: bool = True) -> bool:
    """Throttle, then issue and mail a code when the email is authorized.

    Unauthorized emails take the same path and response without a code or mail.
    Raises OtpThrottledError when the email is cooling down or over the send cap.
    """
    code = _reserve_send(email, allowed=allowed)
    if code is None:
        return _public_email_sent(settings.send_real_email)

    email_sent = await send_verification_email(email, code)
    if not email_sent:
        logger.warning(
            "Email was not sent for %s. "
            "Code is available in server logs when debug is enabled.",
            email,
        )
        if settings.debug:
            logger.warning(
                "Manual login code for %s: %s (expires in %s minutes)",
                email,
                code,
                CODE_TTL_MINUTES,
            )
    return _public_email_sent(email_sent)


def verify_code(email: str, code: str, *, allowed: bool = True) -> bool:
    """Check a code. Each code allows MAX_VERIFY_ATTEMPTS wrong guesses, then it is void.

    Wrong guesses never lock the email: guesses per email stay bounded by the
    per-code limit times the send cap, and a correct code always works until voided.
    """
    with _CODES_LOCK:
        codes = _load_verification_codes()
        record = dict(codes.get(email, {}))

        stored_code = record.get("code")
        matches = (
            allowed
            and isinstance(stored_code, str)
            and secrets.compare_digest(stored_code.encode(), code.encode())
        )
        if matches:
            del codes[email]
            _save_verification_codes(codes)
            logger.info("Verification successful for %s", email)
            return True

        if isinstance(stored_code, str):
            attempts = int(record.get("attempts", 0)) + 1
            if attempts >= MAX_VERIFY_ATTEMPTS:
                for field in ("code", "expires_at", "attempts"):
                    record.pop(field, None)
                logger.warning(
                    "Too many failed verification attempts for %s; code invalidated",
                    email,
                )
            else:
                record["attempts"] = attempts
        if not allowed:
            record["allowed"] = False

        if record:
            codes[email] = record
        else:
            codes.pop(email, None)
        _evict_overflow(codes, keep=email)
        _save_verification_codes(codes)
        logger.warning("Invalid verification code for %s", email)
        return False


def create_access_token(email: str) -> str:
    now = _utc_now()
    to_encode = {
        "sub": email,
        "iss": settings.jwt_issuer,
        "aud": JWT_AUDIENCE,
        "typ": JWT_TOKEN_TYPE,
        "exp": now + timedelta(minutes=settings.jwt_expiration_minutes),
        "iat": now,
    }
    return jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            audience=JWT_AUDIENCE,
            issuer=settings.jwt_issuer,
            options={"require": JWT_REQUIRED_CLAIMS},
        )
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return None
    except jwt.InvalidTokenError:
        logger.warning("Invalid token")
        return None

    if payload.get("typ") != JWT_TOKEN_TYPE:
        logger.warning("Token has unexpected type")
        return None
    email = payload.get("sub")
    return email if isinstance(email, str) else None
