from __future__ import annotations

import asyncio
import json
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from services.relay_auth_service import RelayAuthError, relay_auth


PROTOCOL = "sermon-live/1"
MAX_OPUS_PACKET_BYTES = 1275
MAX_SUBTITLE_LENGTH = 4000
STATUS_VALUES = {
    "starting",
    "live",
    "reconnecting",
    "live_recovered",
    "ending",
    "ended",
    "error",
}


class RelayProtocolError(Exception):
    pass


@dataclass
class PublisherConnection:
    websocket: WebSocket
    metadata: dict[str, Any]
    last_audio_sequence: int = -1
    last_control_sequences: dict[str, int] = field(default_factory=dict)


@dataclass(eq=False)
class ListenerConnection:
    websocket: WebSocket
    audio_enabled: bool = False
    ready: bool = False
    pending: deque[tuple[str, Any]] = field(default_factory=deque)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


@dataclass
class RelayStreamService:
    _publishers: dict[str, PublisherConnection] = field(default_factory=dict)
    _listeners: dict[str, set[ListenerConnection]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _event_cursor: int = 0
    _poll_task: asyncio.Task[None] | None = None
    send_timeout_seconds: float = 5.0
    max_pending_listener_messages: int = 256

    @staticmethod
    def validate_publisher_hello(
        payload: Any, expected_session_id: str
    ) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise RelayProtocolError("Invalid publisher handshake")
        if (
            payload.get("type") != "publisher_hello"
            or payload.get("protocol") != PROTOCOL
            or payload.get("session_id") != expected_session_id
            or payload.get("codec") != "opus"
            or payload.get("container") != "raw-opus"
            or payload.get("sample_rate") != 24000
            or payload.get("channels") != 1
            or payload.get("packet_duration_ms") != 20
            or payload.get("target_bitrate") != 48000
        ):
            raise RelayProtocolError("Invalid publisher handshake")
        return {
            "codec": "opus",
            "sample_rate": 24000,
            "channels": 1,
            "packet_duration_ms": 20,
        }

    async def register_publisher(
        self, session_id: str, websocket: WebSocket, metadata: dict[str, Any]
    ) -> None:
        async with self._lock:
            previous = self._publishers.get(session_id)
            self._publishers[session_id] = PublisherConnection(websocket, metadata)
        if previous is not None and previous.websocket is not websocket:
            await self._close(previous.websocket, 1012, "Publisher reconnected")

    async def unregister_publisher(
        self, session_id: str, websocket: WebSocket
    ) -> None:
        async with self._lock:
            current = self._publishers.get(session_id)
            if current is not None and current.websocket is websocket:
                del self._publishers[session_id]

    async def publisher_metadata(self, session_id: str) -> dict[str, Any]:
        metadata = relay_auth.get_session_metadata(session_id)
        if metadata is None or not relay_auth.publisher_session_is_active(session_id):
            raise RelayAuthError("Session unavailable")
        return metadata

    async def register_listener(
        self, session_id: str, websocket: WebSocket
    ) -> ListenerConnection:
        listener = ListenerConnection(websocket)
        async with self._lock:
            self._listeners.setdefault(session_id, set()).add(listener)
            if self._poll_task is None or self._poll_task.done():
                self._event_cursor = relay_auth.latest_event_id()
                self._poll_task = asyncio.create_task(
                    self._poll_events(), name="relay-event-poller"
                )
        return listener

    async def unregister_listener(
        self, session_id: str, listener: ListenerConnection
    ) -> None:
        poll_task: asyncio.Task[None] | None = None
        async with self._lock:
            listeners = self._listeners.get(session_id)
            if listeners is not None:
                listeners.discard(listener)
                if not listeners:
                    self._listeners.pop(session_id, None)
            if not self._listeners and self._poll_task is not None:
                poll_task = self._poll_task
                self._poll_task = None
                if poll_task is not asyncio.current_task():
                    poll_task.cancel()
        if poll_task is not None and poll_task is not asyncio.current_task():
            await asyncio.gather(poll_task, return_exceptions=True)

    async def activate_listener(self, listener: ListenerConnection) -> None:
        async with listener.send_lock:
            async with self._lock:
                pending = list(listener.pending)
                listener.pending.clear()
                listener.ready = True
            for kind, payload in pending:
                await self._send_raw(listener.websocket, kind, payload)

    async def close_listeners(self, session_id: str, reason: str) -> None:
        async with self._lock:
            listeners = list(self._listeners.pop(session_id, ()))
        relay_auth.publish_event(
            session_id, "revoke", reason.encode("utf-8")
        )
        await asyncio.gather(
            *(
                self._close(listener.websocket, 1008, reason)
                for listener in listeners
            ),
            return_exceptions=True,
        )

    async def set_listener_audio(
        self, listener: ListenerConnection, enabled: bool
    ) -> None:
        listener.audio_enabled = enabled

    async def forward_control(
        self, session_id: str, payload: dict[str, Any]
    ) -> None:
        message_type = payload.get("type")
        if payload.get("session_id") != session_id:
            raise RelayProtocolError("Session mismatch")
        if message_type == "subtitle":
            if set(payload) != {
                "type",
                "session_id",
                "sequence",
                "timestamp_ms",
                "language",
                "text",
            }:
                raise RelayProtocolError("Invalid subtitle event")
            sequence = payload.get("sequence")
            timestamp_ms = payload.get("timestamp_ms")
            language = payload.get("language")
            text = payload.get("text")
            if (
                not _is_nonnegative_int(sequence)
                or not _is_nonnegative_int(timestamp_ms)
                or language not in {"en", "de"}
                or not isinstance(text, str)
                or not text
                or len(text) > MAX_SUBTITLE_LENGTH
            ):
                raise RelayProtocolError("Invalid subtitle event")
        elif message_type == "status":
            if set(payload) != {
                "type",
                "session_id",
                "sequence",
                "timestamp_ms",
                "status",
            }:
                raise RelayProtocolError("Invalid status event")
            if (
                not _is_nonnegative_int(payload.get("sequence"))
                or not _is_nonnegative_int(payload.get("timestamp_ms"))
                or payload.get("status") not in STATUS_VALUES
            ):
                raise RelayProtocolError("Invalid status event")
        else:
            raise RelayProtocolError("Unsupported publisher event")
        async with self._lock:
            publisher = self._publishers.get(session_id)
            if publisher is None:
                raise RelayProtocolError("Publisher unavailable")
            sequence = payload["sequence"]
            if sequence <= publisher.last_control_sequences.get(message_type, -1):
                raise RelayProtocolError("Control event sequence must increase")
            publisher.last_control_sequences[message_type] = sequence
        relay_auth.publish_event(
            session_id, "json", json.dumps(payload).encode("utf-8")
        )

    async def forward_audio(self, session_id: str, frame: bytes) -> None:
        if len(frame) < 20 or frame[:4] != b"SL1A" or frame[4] != 1 or frame[5] != 0:
            raise RelayProtocolError("Invalid audio frame")
        payload_length = int.from_bytes(frame[6:8], "little")
        if payload_length == 0 or payload_length > MAX_OPUS_PACKET_BYTES:
            raise RelayProtocolError("Invalid audio payload length")
        if len(frame) != 20 + payload_length:
            raise RelayProtocolError("Audio payload length mismatch")
        sequence = int.from_bytes(frame[16:20], "big")
        async with self._lock:
            publisher = self._publishers.get(session_id)
            if publisher is None:
                raise RelayProtocolError("Publisher unavailable")
            if sequence <= publisher.last_audio_sequence:
                raise RelayProtocolError("Audio sequence must increase")
            sequence_gap = (
                publisher.last_audio_sequence >= 0
                and sequence > publisher.last_audio_sequence + 1
            )
            publisher.last_audio_sequence = sequence
        if sequence_gap:
            relay_auth.publish_event(
                session_id,
                "json",
                json.dumps({
                    "type": "audio_gap",
                    "session_id": session_id,
                    "sequence": sequence,
                }).encode("utf-8"),
            )
        relay_auth.publish_event(session_id, "audio", frame)

    async def handle_listener_message(
        self, listener: ListenerConnection, message: Any
    ) -> None:
        try:
            payload = json.loads(message)
        except (TypeError, ValueError) as error:
            raise RelayProtocolError("Invalid listener message") from error
        if not isinstance(payload, dict):
            raise RelayProtocolError("Invalid listener message")
        if (
            set(payload) == {"type", "enabled"}
            and payload.get("type") == "audio"
            and isinstance(payload.get("enabled"), bool)
        ):
            await self.set_listener_audio(listener, payload["enabled"])
            return
        if set(payload) == {"type"} and payload.get("type") == "ping":
            async with listener.send_lock:
                await self._send_json(listener.websocket, {"type": "pong"})
            return
        raise RelayProtocolError("Unsupported listener message")

    async def end_session(self, session_id: str, reason: str) -> None:
        async with self._lock:
            publisher = self._publishers.pop(session_id, None)
            listeners = list(self._listeners.pop(session_id, ()))
        ended = {
            "type": "status",
            "session_id": session_id,
            "sequence": 0,
            "timestamp_ms": 0,
            "status": "ended",
            "reason": reason,
        }
        relay_auth.publish_event(
            session_id, "close", json.dumps(ended).encode("utf-8")
        )
        await self._send_to_listeners(
            listeners, "json", ended, subscribed_audio_only=False
        )
        await asyncio.gather(
            *(
                self._close(listener.websocket, 1000, "Session ended")
                for listener in listeners
            ),
            *(
                [self._close(publisher.websocket, 1000, "Session ended")]
                if publisher is not None
                else []
            ),
            return_exceptions=True,
        )

    async def _poll_events(self) -> None:
        try:
            while True:
                async with self._lock:
                    if not self._listeners:
                        return
                events = relay_auth.read_events_after(self._event_cursor)
                if not events:
                    await asyncio.sleep(0.05)
                    continue
                for event_id, session_id, kind, payload in events:
                    self._event_cursor = event_id
                    async with self._lock:
                        listeners = list(self._listeners.get(session_id, ()))
                    if not listeners:
                        continue
                    if kind == "json":
                        try:
                            message = json.loads(payload)
                        except (TypeError, ValueError):
                            continue
                        await self._send_to_listeners(
                            listeners, "json", message, subscribed_audio_only=False
                        )
                    elif kind == "audio":
                        await self._send_to_listeners(
                            listeners, "bytes", payload, subscribed_audio_only=True
                        )
                    elif kind in {"close", "revoke"}:
                        if kind == "close":
                            try:
                                ended = json.loads(payload)
                            except (TypeError, ValueError):
                                ended = None
                            if isinstance(ended, dict):
                                await self._send_to_listeners(
                                    listeners,
                                    "json",
                                    ended,
                                    subscribed_audio_only=False,
                                )
                        async with self._lock:
                            self._listeners.pop(session_id, None)
                        await asyncio.gather(
                            *(
                                self._close(
                                    listener.websocket,
                                    1000 if kind == "close" else 1008,
                                    "Session ended"
                                    if kind == "close"
                                    else "Listener access changed",
                                )
                                for listener in listeners
                            ),
                            return_exceptions=True,
                        )
        except asyncio.CancelledError:
            raise

    async def _send_to_listeners(
        self,
        listeners: list[ListenerConnection],
        kind: str,
        payload: Any,
        *,
        subscribed_audio_only: bool,
    ) -> None:
        targets = [
            listener for listener in listeners
            if not subscribed_audio_only or listener.audio_enabled
        ]
        ready_targets: list[ListenerConnection] = []
        stale: list[ListenerConnection] = []
        async with self._lock:
            for listener in targets:
                if listener.ready:
                    ready_targets.append(listener)
                elif len(listener.pending) < self.max_pending_listener_messages:
                    listener.pending.append((kind, payload))
                else:
                    stale.append(listener)
        results = await asyncio.gather(
            *(
                self._send_one(listener, kind, payload)
                for listener in ready_targets
            ),
            return_exceptions=True,
        )
        stale.extend([
            listener
            for listener, result in zip(ready_targets, results)
            if isinstance(result, Exception)
        ])
        if stale:
            async with self._lock:
                for session_id, entries in list(self._listeners.items()):
                    entries.difference_update(stale)
                    if not entries:
                        self._listeners.pop(session_id, None)
            await asyncio.gather(
                *(
                    self._close(listener.websocket, 1013, "Listener is too slow")
                    for listener in stale
                ),
                return_exceptions=True,
            )

    async def _send_one(
        self, listener: ListenerConnection, kind: str, payload: Any
    ) -> None:
        async with listener.send_lock:
            await self._send_raw(listener.websocket, kind, payload)

    async def _send_raw(self, websocket: WebSocket, kind: str, payload: Any) -> None:
        if kind == "bytes":
            await asyncio.wait_for(
                websocket.send_bytes(payload), timeout=self.send_timeout_seconds
            )
        else:
            await self._send_json(websocket, payload)

    async def _send_json(self, websocket: WebSocket, payload: dict[str, Any]) -> None:
        await asyncio.wait_for(
            websocket.send_json(payload), timeout=self.send_timeout_seconds
        )

    @staticmethod
    async def _close(websocket: WebSocket, code: int, reason: str) -> None:
        try:
            await websocket.close(code=code, reason=reason)
        except (RuntimeError, WebSocketDisconnect):
            return


def _is_nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


relay_stream = RelayStreamService()
