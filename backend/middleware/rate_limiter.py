import ipaddress
import time
import logging
from collections import defaultdict
from typing import Dict, Literal

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import settings


logger = logging.getLogger(__name__)

BYPASS_PATHS = {"/health", "/"}
MEDIA_PATH_PREFIX = "/api/v1/media/"

BLOCK_SECONDS = 15 * 60
REQUEST_WINDOW_SECONDS = 60
PURGE_EVERY_CALLS = 1000
MEDIA_RETRY_AFTER_SECONDS = 2

Bucket = Literal["general", "media"]

# General API: catch scrapers / credential stuffing.
GENERAL_BURST = 30
GENERAL_PER_MINUTE = 300

# CMS multi-file upload (up to 30 photos + optimize) is intentionally bursty.
MEDIA_BURST = 120
MEDIA_PER_MINUTE = 600


def resolve_client_ip(request: Request, trusted_proxy_hops: int) -> str:
    """Pick the client IP; forwarding headers count only from trusted proxies.

    Each trusted proxy appends the address it saw to X-Forwarded-For, so the
    value `trusted_proxy_hops` entries from the right is the first one a
    client could not have forged.
    """
    if trusted_proxy_hops > 0:
        entries = [
            entry.strip()
            for entry in request.headers.get("X-Forwarded-For", "").split(",")
            if entry.strip()
        ]
        if len(entries) >= trusted_proxy_hops and _is_ip_address(
            entries[-trusted_proxy_hops]
        ):
            return entries[-trusted_proxy_hops]

    if request.client:
        return request.client.host

    return "unknown"


def _is_ip_address(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


class IpRateLimiter:
    def __init__(self):
        self.request_log: Dict[tuple[str, Bucket], list[float]] = defaultdict(list)
        self.blocked_ips: Dict[str, float] = {}
        self._calls_since_purge = 0

    def _purge_stale_entries(self, now: float) -> None:
        stale_keys = [
            key
            for key, timestamps in self.request_log.items()
            if not timestamps or timestamps[-1] <= now - REQUEST_WINDOW_SECONDS
        ]
        for key in stale_keys:
            del self.request_log[key]
        expired_ips = [ip for ip, until in self.blocked_ips.items() if until <= now]
        for ip in expired_ips:
            del self.blocked_ips[ip]

    def is_allowed(
        self,
        ip: str,
        bucket: Bucket = "general",
    ) -> tuple[bool, str, int]:
        now = time.time()

        self._calls_since_purge += 1
        if self._calls_since_purge >= PURGE_EVERY_CALLS:
            self._calls_since_purge = 0
            self._purge_stale_entries(now)

        if ip in self.blocked_ips:
            if now < self.blocked_ips[ip]:
                remaining = int(self.blocked_ips[ip] - now)
                return (
                    False,
                    f"Too many requests blocked. Please try again in {remaining} seconds.",
                    remaining,
                )
            del self.blocked_ips[ip]

        key = (ip, bucket)
        burst_limit = MEDIA_BURST if bucket == "media" else GENERAL_BURST
        per_minute = MEDIA_PER_MINUTE if bucket == "media" else GENERAL_PER_MINUTE

        self.request_log[key] = [
            ts for ts in self.request_log[key] if ts > now - 60
        ]
        recent_requests = self.request_log[key]

        burst_requests = [ts for ts in recent_requests if ts > now - 1]
        if len(burst_requests) >= burst_limit:
            if bucket == "media":
                # Soft reject: admin batch upload should not get a 15-minute ban.
                logger.warning(
                    "Media burst limit exceeded for %s (%s requests/sec)",
                    ip,
                    len(burst_requests),
                )
                return (
                    False,
                    "Too many media requests. Please retry shortly.",
                    MEDIA_RETRY_AFTER_SECONDS,
                )
            self.blocked_ips[ip] = now + BLOCK_SECONDS
            logger.warning(
                "Burst limit exceeded for %s (%s requests/sec); blocked %s seconds",
                ip,
                len(burst_requests),
                BLOCK_SECONDS,
            )
            return False, "Abnormal request pattern detected. IP blocked.", BLOCK_SECONDS

        if len(recent_requests) >= per_minute:
            if bucket == "media":
                logger.warning(
                    "Media rate limit exceeded for %s (%s requests/min)",
                    ip,
                    len(recent_requests),
                )
                return (
                    False,
                    "Too many media requests. Please retry shortly.",
                    MEDIA_RETRY_AFTER_SECONDS,
                )
            self.blocked_ips[ip] = now + BLOCK_SECONDS
            logger.warning(
                "Rate limit exceeded for %s (%s requests/min); blocked %s seconds",
                ip,
                len(recent_requests),
                BLOCK_SECONDS,
            )
            return False, "Too many requests. IP blocked.", BLOCK_SECONDS

        self.request_log[key].append(now)
        return True, "", 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, debug: bool = False):
        super().__init__(app)
        self.debug = debug
        self.limiter = IpRateLimiter() if not debug else None

        if debug:
            logger.info("Rate limiter disabled (debug mode)")
        else:
            logger.info("Rate limiter enabled")

    def _get_client_ip(self, request: Request) -> str:
        return resolve_client_ip(request, settings.effective_trusted_proxy_hops)

    def _is_localhost(self, ip: str) -> bool:
        return ip in {"127.0.0.1", "::1", "localhost"}

    def _bucket_for_path(self, path: str) -> Bucket:
        if path.startswith(MEDIA_PATH_PREFIX):
            return "media"
        return "general"

    async def dispatch(self, request: Request, call_next):
        if self.debug:
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        if request.url.path in BYPASS_PATHS:
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        behind_proxy = settings.effective_trusted_proxy_hops > 0
        if not behind_proxy and self._is_localhost(client_ip):
            return await call_next(request)

        bucket = self._bucket_for_path(request.url.path)
        is_allowed, reason, retry_after = self.limiter.is_allowed(
            client_ip, bucket=bucket
        )
        if not is_allowed:
            logger.warning(
                "Rate limit blocked: %s -> %s (%s)",
                client_ip,
                request.url.path,
                bucket,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": reason,
                    "error": "Too Many Requests",
                },
                headers={"Retry-After": str(max(retry_after, 1))},
            )

        return await call_next(request)
