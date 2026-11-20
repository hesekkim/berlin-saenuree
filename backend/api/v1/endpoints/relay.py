import asyncio
import json
import time

from fastapi import APIRouter, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, status

from core.config import settings
from middleware.rate_limiter import resolve_client_ip
from models.relay import (
    RelayListenerTokenResponse,
    RelaySessionPasswordRequest,
    RelaySessionResponse,
    RelaySessionUpsertRequest,
)
from services.relay_auth_service import RelayAuthError, RelayLimitError, relay_auth
from services.relay_stream_service import (
    PROTOCOL,
    RelayProtocolError,
    relay_stream,
)


router = APIRouter()


def _client_ip(request: Request) -> str:
    return resolve_client_ip(request, settings.effective_trusted_proxy_hops)


def _check_websocket_admission(websocket: WebSocket, session_id: str) -> bool:
    return relay_auth.allow_ws_connection(_client_ip(websocket), session_id)


@router.post("/sessions/{session_id}", response_model=RelaySessionResponse)
async def upsert_session(
    session_id: str,
    body: RelaySessionUpsertRequest,
    x_publisher_credential: str | None = Header(
        default=None, alias="X-Publisher-Credential"
    ),
) -> RelaySessionResponse:
    try:
        relay_auth.validate_publisher_credential(x_publisher_credential)
        existed = True
        try:
            relay_auth.get_session(session_id)
        except RelayAuthError:
            existed = False
        session = relay_auth.upsert_session(
            session_id, body.listener_password.get_secret_value()
        )
        if existed:
            await relay_stream.close_listeners(session_id, "Listener access changed")
    except RelayAuthError as error:
        if isinstance(error, RelayLimitError):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Relay session limit reached",
            ) from error
        raise HTTPException(status_code=401, detail=str(error)) from error
    return RelaySessionResponse(session_id=session.session_id, status=session.status)


@router.post("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    x_publisher_credential: str | None = Header(
        default=None, alias="X-Publisher-Credential"
    ),
) -> dict[str, str]:
    try:
        relay_auth.validate_publisher_credential(x_publisher_credential)
        relay_auth.end_session(session_id)
        await relay_stream.end_session(session_id, "publisher_closed")
    except RelayAuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    return {"status": "ended"}


@router.get("/sessions/{session_id}/status")
async def session_status(
    session_id: str,
    x_publisher_credential: str | None = Header(
        default=None, alias="X-Publisher-Credential"
    ),
) -> dict[str, object]:
    try:
        relay_auth.validate_publisher_credential(x_publisher_credential)
        relay_session = relay_auth.get_session(session_id)
        listener_count = (
            await relay_stream.listener_count(session_id)
            if relay_session.status == "live"
            else 0
        )
    except RelayAuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    return {
        "session_id": session_id,
        "status": relay_session.status,
        "listener_count": listener_count,
    }


@router.post(
    "/sessions/{session_id}/listener-token",
    response_model=RelayListenerTokenResponse,
)
async def listener_token(
    request: Request,
    session_id: str,
    body: RelaySessionPasswordRequest,
) -> RelayListenerTokenResponse:
    try:
        token = relay_auth.verify_listener_password(
            session_id,
            body.listener_password.get_secret_value(),
            _client_ip(request),
        )
    except RelayAuthError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session or listener password",
        ) from error
    if not relay_auth.publisher_session_is_active(
        session_id
    ) or not await relay_stream.listener_admission_is_open(session_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Broadcast is not currently live",
        )
    return RelayListenerTokenResponse(
        listener_token=token,
        expires_in_seconds=max(1, settings.relay_listener_token_minutes) * 60,
    )


@router.websocket("/ws/publisher/{session_id}")
async def publisher_socket(websocket: WebSocket, session_id: str) -> None:
    if not _check_websocket_admission(websocket, session_id):
        await websocket.accept()
        await websocket.close(code=1008, reason="Too many connection attempts")
        return
    if (
        websocket.headers.get("origin")
        and not relay_auth.validate_origin(websocket)
        and not settings.debug
    ):
        await websocket.close(code=1008, reason="Origin not allowed")
        return
    try:
        relay_auth.validate_publisher_credential(
            websocket.headers.get("x-publisher-credential")
        )
        session = relay_auth.get_session(session_id)
        if session.status == "ended":
            raise RelayAuthError("Session unavailable")
    except RelayAuthError:
        await websocket.accept()
        await websocket.close(code=1008, reason="Authentication failed")
        return

    await websocket.accept()
    heartbeat_task: asyncio.Task[None] | None = None
    generation: int | None = None
    session_active = False
    explicitly_closed = False
    try:
        hello_text = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        if len(hello_text.encode("utf-8")) > 16 * 1024:
            raise RelayProtocolError("Publisher handshake is too large")
        try:
            hello = json.loads(hello_text)
        except ValueError as error:
            raise RelayProtocolError("Invalid publisher handshake") from error
        metadata = relay_stream.validate_publisher_hello(hello, session_id)
        generation = relay_auth.claim_publisher_session(session_id)
        await relay_stream.register_publisher(session_id, websocket, metadata)
        session_active = True
        relay_auth.set_session_metadata(session_id, metadata)
        heartbeat_task = asyncio.create_task(
            _publisher_heartbeat(websocket, session_id, generation),
            name=f"relay-publisher-heartbeat-{session_id}",
        )
        await websocket.send_json(
            {
                "type": "publisher_ready",
                "protocol": PROTOCOL,
                "session_id": session_id,
                **metadata,
            }
        )

        while True:
            message = await asyncio.wait_for(
                websocket.receive(), timeout=settings.relay_idle_timeout_seconds
            )
            if message["type"] == "websocket.disconnect":
                break
            if not relay_auth.touch_publisher_session(session_id, generation):
                await websocket.close(code=1008, reason="Session ended")
                return
            text = message.get("text")
            binary = message.get("bytes")
            if text is not None:
                if len(text.encode("utf-8")) > 16 * 1024:
                    raise RelayProtocolError("Publisher message is too large")
                try:
                    payload = json.loads(text)
                except ValueError as error:
                    raise RelayProtocolError("Invalid publisher event") from error
                if not isinstance(payload, dict):
                    raise RelayProtocolError("Invalid publisher event")
                if payload.get("type") == "publisher_ping":
                    if (
                        set(payload)
                        != {"type", "session_id", "timestamp_ms"}
                        or payload.get("session_id") != session_id
                        or not _is_nonnegative_int(payload.get("timestamp_ms"))
                    ):
                        raise RelayProtocolError("Invalid publisher ping")
                elif payload.get("type") == "publisher_close":
                    if (
                        set(payload)
                        != {"type", "session_id", "reason", "sequence"}
                        or payload.get("session_id") != session_id
                        or payload.get("reason")
                        not in {
                            "publisher_closed",
                            "idle_timeout",
                            "publisher_error",
                            "server_shutdown",
                        }
                        or not _is_nonnegative_int(payload.get("sequence"))
                    ):
                        raise RelayProtocolError("Invalid publisher close event")
                    relay_auth.end_session(session_id)
                    await relay_stream.end_session(session_id, payload["reason"])
                    explicitly_closed = True
                    return
                else:
                    await relay_stream.forward_control(session_id, payload)
            elif binary is not None:
                if len(binary) > 20 + 1275:
                    raise RelayProtocolError("Audio frame is too large")
                await relay_stream.forward_audio(session_id, binary)
            else:
                raise RelayProtocolError("Unsupported publisher frame")
    except asyncio.TimeoutError:
        if session_active:
            relay_auth.end_session(session_id)
            await relay_stream.end_session(session_id, "idle_timeout")
            explicitly_closed = True
        else:
            await _send_publisher_error(websocket, "Publisher handshake timed out")
    except (RelayAuthError, RelayProtocolError, WebSocketDisconnect):
        await _send_publisher_error(websocket, "Invalid publisher message")
    finally:
        if heartbeat_task is not None:
            heartbeat_task.cancel()
            await asyncio.gather(heartbeat_task, return_exceptions=True)
        await relay_stream.unregister_publisher(session_id, websocket)
        if generation is not None:
            relay_auth.release_publisher_session(session_id, generation)
        if session_active and not explicitly_closed:
            try:
                relay_auth.end_session(session_id)
                await relay_stream.end_session(session_id, "publisher_closed")
            except RelayAuthError:
                pass


@router.websocket("/ws/listener/{session_id}")
async def listener_socket(websocket: WebSocket, session_id: str) -> None:
    if not _check_websocket_admission(websocket, session_id):
        await websocket.accept()
        await websocket.close(code=1008, reason="Too many connection attempts")
        return
    if not relay_auth.validate_origin(websocket) and not settings.debug:
        await websocket.close(code=1008, reason="Origin not allowed")
        return
    await websocket.accept()
    token_expiration: int
    try:
        hello_text = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        if len(hello_text.encode("utf-8")) > 8 * 1024:
            raise RelayProtocolError("Listener handshake is too large")
        try:
            hello = json.loads(hello_text)
        except ValueError as error:
            raise RelayProtocolError("Invalid Listener handshake") from error
        if (
            not isinstance(hello, dict)
            or set(hello) != {"type", "session_id", "listener_token"}
            or hello.get("type") != "listener_hello"
            or hello.get("session_id") != session_id
            or not isinstance(hello.get("listener_token"), str)
        ):
            raise RelayProtocolError("Invalid Listener handshake")
        token_expiration = relay_auth.verify_listener_token(
            hello["listener_token"], session_id
        )
        metadata = await relay_stream.publisher_metadata(session_id)
        publisher_status = await relay_stream.publisher_status(session_id)
    except WebSocketDisconnect:
        return
    except (asyncio.TimeoutError, RelayAuthError, RelayProtocolError):
        await websocket.close(code=1008, reason="Authentication failed")
        return

    try:
        listener = await relay_stream.register_listener(session_id, websocket)
    except RelayProtocolError:
        await websocket.close(code=1013, reason="Relay listener limit reached")
        return
    expiry_task = asyncio.create_task(
        _expire_listener_token(websocket, token_expiration),
        name=f"relay-listener-token-expiry-{session_id}",
    )
    try:
        await websocket.send_json(
            {
                "type": "listener_ready",
                "protocol": PROTOCOL,
                "session_id": session_id,
                "status": publisher_status,
                **metadata,
            }
        )
        await relay_stream.activate_listener(listener)
        while True:
            message = await asyncio.wait_for(
                websocket.receive(), timeout=settings.relay_idle_timeout_seconds
            )
            if message["type"] == "websocket.disconnect":
                return
            text = message.get("text")
            if text is None:
                raise RelayProtocolError("Binary listener message not allowed")
            if len(text.encode("utf-8")) > 8 * 1024:
                raise RelayProtocolError("Listener message is too large")
            await relay_stream.handle_listener_message(listener, text)
    except WebSocketDisconnect:
        return
    except asyncio.TimeoutError:
        await websocket.close(code=1001, reason="Listener heartbeat timeout")
        return
    except RelayProtocolError:
        await websocket.close(code=1008, reason="Invalid listener message")
    finally:
        expiry_task.cancel()
        await asyncio.gather(expiry_task, return_exceptions=True)
        await relay_stream.unregister_listener(session_id, listener)


async def _send_publisher_error(websocket: WebSocket, detail: str) -> None:
    try:
        await websocket.send_json({"type": "publisher_error", "detail": detail})
        await websocket.close(code=1008, reason="Publisher protocol error")
    except (RuntimeError, WebSocketDisconnect):
        return


def _is_nonnegative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


async def _publisher_heartbeat(
    websocket: WebSocket, session_id: str, generation: int
) -> None:
    while True:
        await asyncio.sleep(15)
        if not relay_auth.touch_publisher_session(session_id, generation):
            try:
                await websocket.close(code=1008, reason="Session ended")
            except RuntimeError:
                pass
            return


async def _expire_listener_token(websocket: WebSocket, expires_at: int) -> None:
    await asyncio.sleep(max(0, expires_at - time.time()))
    try:
        await websocket.close(code=1008, reason="Listener token expired")
    except (RuntimeError, WebSocketDisconnect):
        return
