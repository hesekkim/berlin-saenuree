import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from core.config import settings
from middleware import rate_limiter
from middleware.rate_limiter import (
    GENERAL_BURST,
    IpRateLimiter,
    RateLimitMiddleware,
    resolve_client_ip,
)


def _request(forwarded_for: str | None, client_host: str | None = "10.0.0.1") -> Request:
    headers = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return Request(
        {
            "type": "http",
            "headers": headers,
            "client": (client_host, 5000) if client_host else None,
        }
    )


def test_forwarding_headers_are_ignored_without_trusted_proxies():
    assert resolve_client_ip(_request("8.8.8.8"), 0) == "10.0.0.1"


def test_takes_the_entry_appended_by_the_trusted_proxy():
    request = _request("6.6.6.6, 8.8.8.8")

    assert resolve_client_ip(request, 1) == "8.8.8.8"


def test_forged_left_entries_do_not_change_the_result():
    assert resolve_client_ip(_request("1.1.1.1, 8.8.8.8"), 1) == "8.8.8.8"
    assert resolve_client_ip(_request("2.2.2.2, 8.8.8.8"), 1) == "8.8.8.8"


def test_two_trusted_hops_skip_the_inner_proxy_entry():
    request = _request("6.6.6.6, 8.8.8.8, 172.16.0.5")

    assert resolve_client_ip(request, 2) == "8.8.8.8"


@pytest.mark.parametrize("header", [None, "", "8.8.8.8"])
def test_falls_back_to_socket_address_when_entries_are_missing(header):
    hops = 2 if header == "8.8.8.8" else 1

    assert resolve_client_ip(_request(header), hops) == "10.0.0.1"


def test_falls_back_when_trusted_entry_is_not_an_ip_address():
    assert resolve_client_ip(_request("8.8.8.8, not-an-ip"), 1) == "10.0.0.1"


def test_unknown_when_nothing_identifies_the_client():
    assert resolve_client_ip(_request(None, client_host=None), 0) == "unknown"


def test_effective_hops_defaults_to_one_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", None)
    monkeypatch.setattr(settings, "trust_proxy_headers", None)
    assert settings.effective_trusted_proxy_hops == 1


def test_explicit_zero_hops_wins_over_legacy_flag(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    assert settings.effective_trusted_proxy_hops == 0


def test_legacy_flag_is_used_only_when_hops_is_unset(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", None)
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert settings.effective_trusted_proxy_hops == 0

    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    assert settings.effective_trusted_proxy_hops == 1

    monkeypatch.setattr(settings, "trusted_proxy_hops", 2)
    assert settings.effective_trusted_proxy_hops == 2


def _limited_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, debug=False)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return app


def _hammer(client: TestClient, headers: dict[str, str]) -> list[int]:
    return [
        client.get("/ping", headers=headers).status_code
        for _ in range(GENERAL_BURST + 1)
    ]


def test_localhost_is_exempt_when_no_proxy_is_trusted(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    client = TestClient(_limited_app(), client=("127.0.0.1", 5000))

    assert set(_hammer(client, {})) == {200}


def test_preflight_requests_do_not_consume_the_general_limit(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    client = TestClient(_limited_app(), client=("127.0.0.1", 5000))
    headers = {"X-Forwarded-For": "8.8.8.8"}

    for _ in range(GENERAL_BURST + 1):
        assert client.options("/ping", headers=headers).status_code != 429

    assert client.get("/ping", headers=headers).status_code == 200


def test_visitors_behind_a_local_proxy_are_counted_individually(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    client = TestClient(_limited_app(), client=("127.0.0.1", 5000))

    first_visitor = _hammer(client, {"X-Forwarded-For": "8.8.8.8"})
    other_visitor = client.get("/ping", headers={"X-Forwarded-For": "9.9.9.9"})

    assert first_visitor[-1] == 429
    assert other_visitor.status_code == 200


def test_rotating_a_forged_header_does_not_escape_the_limit(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    client = TestClient(_limited_app(), client=("127.0.0.1", 5000))

    statuses = [
        client.get("/ping", headers={"X-Forwarded-For": f"1.1.1.{index}, 8.8.8.8"})
        for index in range(GENERAL_BURST + 1)
    ]

    assert statuses[-1].status_code == 429


def test_purge_removes_idle_keys_and_expired_blocks(monkeypatch):
    monkeypatch.setattr(rate_limiter, "PURGE_EVERY_CALLS", 1)
    limiter = IpRateLimiter()
    now = time.time()
    limiter.request_log[("1.1.1.1", "general")] = [now - 120]
    limiter.request_log[("2.2.2.2", "general")] = []
    limiter.blocked_ips["3.3.3.3"] = now - 1
    limiter.blocked_ips["4.4.4.4"] = now + 600

    limiter.is_allowed("5.5.5.5")

    assert ("1.1.1.1", "general") not in limiter.request_log
    assert ("2.2.2.2", "general") not in limiter.request_log
    assert ("5.5.5.5", "general") in limiter.request_log
    assert "3.3.3.3" not in limiter.blocked_ips
    assert "4.4.4.4" in limiter.blocked_ips


def test_purge_keeps_recently_active_keys(monkeypatch):
    monkeypatch.setattr(rate_limiter, "PURGE_EVERY_CALLS", 1)
    limiter = IpRateLimiter()
    limiter.request_log[("1.1.1.1", "general")] = [time.time() - 5]

    limiter.is_allowed("2.2.2.2")

    assert ("1.1.1.1", "general") in limiter.request_log
