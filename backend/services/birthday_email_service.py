from __future__ import annotations

import asyncio
import calendar
import html
import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from core.config import settings
from core.json_store import JsonStoreCorruptError, read_json_store, write_json_store
from core.store_lock import STORE_LOCK
from models.cms import (
    BirthdayEmailStatusDelivery,
    BirthdayEmailStatusResponse,
)
from services.church_members_service import list_church_members
from services.email_service import send_birthday_email


logger = logging.getLogger(__name__)
BERLIN_TIMEZONE = ZoneInfo("Europe/Berlin")
MAX_DELIVERY_HISTORY = 12


def _empty_store() -> dict:
    return {"enabled": False, "recipients": [], "deliveries": {}}


def _load_store() -> dict:
    path = settings.birthday_email_file
    payload = read_json_store(path)
    if payload is None:
        return _empty_store()
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("enabled"), bool)
        or not isinstance(payload.get("recipients"), list)
        or not all(isinstance(item, str) for item in payload["recipients"])
        or not isinstance(payload.get("deliveries", {}), dict)
    ):
        raise JsonStoreCorruptError(path, "invalid birthday email settings")
    deliveries = payload.get("deliveries", {})
    if any(
        not isinstance(month, str)
        or not isinstance(record, dict)
        or record.get("month") != month
        or record.get("status") not in {"sending", "sent", "failed"}
        or not isinstance(record.get("attemptedAt"), str)
        or any(
            not isinstance(record.get(field, []), list)
            or not all(
                isinstance(recipient, str) for recipient in record.get(field, [])
            )
            for field in ("recipients", "sentRecipients", "failedRecipients")
        )
        for month, record in deliveries.items()
    ):
        raise JsonStoreCorruptError(path, "invalid birthday email delivery record")
    return {
        "enabled": payload["enabled"],
        "recipients": payload["recipients"],
        "deliveries": deliveries,
    }


def _delivery_history(store: dict) -> list[dict]:
    records = sorted(
        store["deliveries"].values(),
        key=lambda item: item["month"],
        reverse=True,
    )[:MAX_DELIVERY_HISTORY]
    return [
        {
            **record,
            "recipientCount": record.get("recipientCount", 0),
            "failedRecipientCount": record.get(
                "failedRecipientCount", len(record.get("failedRecipients", []))
            ),
            "recipients": record.get("recipients", []),
            "sentRecipients": record.get("sentRecipients", []),
            "failedRecipients": record.get("failedRecipients", []),
        }
        for record in records
    ]


def _trim_delivery_history(
    store: dict,
    *,
    preserve_month: str | None = None,
) -> None:
    months = sorted(store["deliveries"], reverse=True)
    retained = months[:MAX_DELIVERY_HISTORY]
    if preserve_month is not None and preserve_month not in retained:
        retained = [preserve_month, *retained[: MAX_DELIVERY_HISTORY - 1]]
    store["deliveries"] = {
        month: store["deliveries"][month] for month in retained
    }


def get_birthday_email_settings() -> dict:
    with STORE_LOCK:
        store = _load_store()
    history = _delivery_history(store)
    return {
        "enabled": store["enabled"],
        "recipients": store["recipients"],
        "lastDelivery": history[0] if history else None,
        "deliveryHistory": history,
    }


def get_birthday_email_status() -> BirthdayEmailStatusResponse:
    with STORE_LOCK:
        store = _load_store()
    history = [
        BirthdayEmailStatusDelivery.model_validate(record)
        for record in _delivery_history(store)
    ]
    return BirthdayEmailStatusResponse(
        enabled=store["enabled"],
        lastDelivery=history[0] if history else None,
        deliveryHistory=history,
    )


def update_birthday_email_settings(*, enabled: bool, recipients: list[str]) -> dict:
    with STORE_LOCK:
        store = _load_store()
        store["enabled"] = enabled
        store["recipients"] = recipients
        _trim_delivery_history(store)
        write_json_store(settings.birthday_email_file, store)
    return get_birthday_email_settings()


def last_sunday_of_month(year: int, month: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    last_date = date(year, month, last_day)
    return date(year, month, last_day - ((last_date.weekday() + 1) % 7))


def next_month_birthday_target(now: datetime) -> str | None:
    local_now = (
        now.replace(tzinfo=BERLIN_TIMEZONE)
        if now.tzinfo is None
        else now.astimezone(BERLIN_TIMEZONE)
    )
    current_date = local_now.date()
    if current_date != last_sunday_of_month(current_date.year, current_date.month):
        return None
    year = current_date.year + (1 if current_date.month == 12 else 0)
    month = 1 if current_date.month == 12 else current_date.month + 1
    return f"{year:04d}-{month:02d}"


def _birthday_rows(members: list[dict], target_month: int) -> list[tuple[str, str]]:
    rows = [
        (member["name"], member["birthDate"])
        for member in members
        if date.fromisoformat(member["birthDate"]).month == target_month
    ]
    return sorted(rows, key=lambda row: (row[1][5:], row[0].casefold()))


def _birthday_message(rows: list[tuple[str, str]]) -> tuple[str, str]:
    text = "\n".join(
        f"{name} - {date.fromisoformat(birth_date):%d.%m}."
        for name, birth_date in rows
    )
    html_rows = "".join(
        f"<li>{html.escape(name)} - {date.fromisoformat(birth_date):%d.%m}.</li>"
        for name, birth_date in rows
    )
    return text, f"<ul>{html_rows}</ul>"


def _claim_delivery(target_month: str, now: datetime) -> tuple[bool, list[str]]:
    with STORE_LOCK:
        store = _load_store()
        if not store["enabled"] or not store["recipients"]:
            return False, []
        existing = store["deliveries"].get(target_month)
        if existing and existing.get("status") in {"sending", "sent", "failed"}:
            return False, []
        recipients = list(store["recipients"])
        store["deliveries"][target_month] = {
            "month": target_month,
            "status": "sending",
            "attemptedAt": now.isoformat(),
            "recipientCount": len(recipients),
            "failedRecipientCount": 0,
            "recipients": recipients,
            "sentRecipients": [],
            "failedRecipients": [],
            "error": None,
        }
        _trim_delivery_history(store, preserve_month=target_month)
        write_json_store(settings.birthday_email_file, store)
        return True, recipients


def _is_configured_for_delivery() -> bool:
    with STORE_LOCK:
        store = _load_store()
    return store["enabled"] and bool(store["recipients"])


def _finish_delivery(
    target_month: str,
    *,
    failed_recipients: list[str],
    error: str | None,
) -> None:
    with STORE_LOCK:
        store = _load_store()
        delivery = store["deliveries"].get(target_month)
        if delivery is None:
            raise RuntimeError(
                f"Birthday email delivery record disappeared: {target_month}"
            )
        delivery["status"] = "failed" if failed_recipients else "sent"
        delivery["sentRecipients"] = [
            recipient
            for recipient in delivery.get("recipients", [])
            if recipient not in failed_recipients
        ]
        delivery["failedRecipients"] = failed_recipients
        delivery["failedRecipientCount"] = len(failed_recipients)
        delivery["error"] = error
        _trim_delivery_history(store, preserve_month=target_month)
        write_json_store(settings.birthday_email_file, store)


def run_monthly_birthday_email(*, now: datetime | None = None) -> None:
    current = datetime.now(BERLIN_TIMEZONE) if now is None else now
    target_month = next_month_birthday_target(current)
    if target_month is None:
        return

    if not _is_configured_for_delivery():
        return

    target_month_number = int(target_month[5:7])
    rows = _birthday_rows(list_church_members(), target_month_number)
    if not rows:
        logger.info(
            "No birthdays found for %s; monthly email was not sent", target_month
        )
        return

    claimed, recipients = _claim_delivery(target_month, current)
    if not claimed:
        return

    text, html_body = _birthday_message(rows)
    failed_recipients: list[str] = []
    error = None
    if not settings.send_real_email:
        error = "email_sending_disabled"
        logger.error("Birthday email delivery skipped: APP_SEND_REAL_EMAIL is disabled")
        failed_recipients = recipients
    elif (
        not settings.smtp_host
        or not settings.smtp_port
        or not settings.smtp_username
        or not settings.smtp_password
        or not settings.smtp_from_email
    ):
        error = "smtp_not_configured"
        logger.error(
            "Birthday email delivery failed: SMTP credentials are not configured"
        )
        failed_recipients = recipients
    else:
        subject = f"Birthdays in {target_month}"
        for recipient in recipients:
            try:
                sent = asyncio.run(
                    send_birthday_email(
                        to_email=recipient,
                        subject=subject,
                        html_content=html_body,
                        text_content=text,
                    )
                )
            except Exception:
                logger.exception("Birthday email delivery failed for %s", recipient)
                sent = False
            if not sent:
                failed_recipients.append(recipient)
        if failed_recipients:
            error = "smtp_delivery_failed"

    _finish_delivery(
        target_month,
        failed_recipients=failed_recipients,
        error=error,
    )
    if failed_recipients:
        logger.error(
            "Birthday email for %s failed for %d of %d recipient(s)",
            target_month,
            len(failed_recipients),
            len(recipients),
        )
    else:
        logger.info(
            "Birthday email for %s sent to %d recipient(s)",
            target_month,
            len(recipients),
        )
