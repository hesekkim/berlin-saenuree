import logging

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from core.config import settings


logger = logging.getLogger(__name__)

MULTIPART_OVERHEAD_BYTES = 1024 * 1024


class RequestBodyTooLargeError(Exception):
    pass


def _limit_for(scope: Scope) -> int:
    upload_path = f"/api/{settings.api_version}/media/files"
    if scope["method"] == "POST" and scope["path"] == upload_path:
        return int(settings.media_max_file_bytes) + MULTIPART_OVERHEAD_BYTES
    video_upload_path = f"{upload_path}/video"
    if scope["method"] == "POST" and scope["path"] == video_upload_path:
        return int(settings.media_max_file_bytes)
    backup_upload_path = f"/api/{settings.api_version}/admin/backups/import"
    if scope["method"] == "POST" and scope["path"] == backup_upload_path:
        return int(settings.backup_max_archive_bytes) + MULTIPART_OVERHEAD_BYTES
    return int(settings.max_request_body_bytes)


def _declared_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


class BodySizeLimitMiddleware:
    """Reject oversized request bodies before they are parsed or buffered.

    FastAPI parses the body before running auth dependencies, so without a cap an
    anonymous client could make the server buffer arbitrarily large payloads.
    Pure ASGI on purpose: it must count bytes as they stream in.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = _limit_for(scope)
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            await self._reject(scope, receive, send, limit)
            return

        received_bytes = 0
        exceeded = False
        response_started = False
        rejected = False

        async def limited_receive() -> Message:
            nonlocal received_bytes, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > limit:
                    exceeded = True
                    raise RequestBodyTooLargeError
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal response_started, rejected
            if exceeded and not response_started:
                # FastAPI turns the receive failure into a 400; replace it with 413.
                if not rejected:
                    rejected = True
                    await self._reject(scope, receive, send, limit)
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except RequestBodyTooLargeError:
            if response_started:
                raise
            if not rejected:
                await self._reject(scope, receive, send, limit)

    async def _reject(
        self, scope: Scope, receive: Receive, send: Send, limit: int
    ) -> None:
        logger.warning(
            "Request body rejected: %s %s exceeds %s bytes",
            scope["method"],
            scope["path"],
            limit,
        )
        response = JSONResponse(
            status_code=413,
            content={"detail": "Request body is too large"},
            headers={"Connection": "close"},
        )
        await response(scope, receive, send)
