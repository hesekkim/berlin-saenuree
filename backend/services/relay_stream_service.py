from __future__ import annotations

import asyncio
import json
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from core.config import settings
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
    current_status: str = "starting"
    last_audio_sequence: int = -1
    last_control_sequences: dict[str, int] = field(default_factory=dict)


@dataclass(eq=False)
class ListenerConnection:
    websocket: WebSocket
    audio_enabled: bool = False
    ready: bool = False
    pending: deque[tuple[str, Any]] = field(default_factory=deque)
    queued_audio_bytes: int = 0
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    pending_event: asyncio.Event = field(default_factory=asyncio.Event)
    sender_task: asyncio.Task[None] | None = None
    closed: bool = False


@dataclass
class RelayMetrics:
    audio_frames_received: int = 0
    audio_frame_bytes_received: int = 0
    control_events_received: int = 0
    control_event_bytes_received: int = 0
    audio_frames_sent: int = 0
    audio_bytes_sent: int = 0
    control_events_sent: int = 0
    control_event_bytes_sent: int = 0
    dropped_audio_frames: int = 0
    slow_listener_disconnects: int = 0
    listener_queue_rejections: int = 0


@dataclass
class RelayStreamService:
    _publishers: dict[str, PublisherConnection] = field(default_factory=dict)
    _listeners: dict[str, set[ListenerConnection]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _event_cursor: int = 0
    _poll_task: asyncio.Task[None] | None = None
    send_timeout_seconds: float = 5.0
    max_pending_listener_messages: int = 256
    max_pending_audio_bytes: int = 144_000
    metrics: RelayMetrics = field(default_factory=RelayMetrics)
    _metrics_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

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
            if (
                len(self._publishers) >= settings.relay_max_publishers
                and session_id not in self._publishers
            ):
                raise RelayProtocolError("Relay publisher limit reached")
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

    async def publisher_status(self, session_id: str) -> str:
        async with self._lock:
            publisher = self._publishers.get(session_id)
            if publisher is None:
                raise RelayProtocolError("Publisher unavailable")
            return publisher.current_status

    async def listener_admission_is_open(self, session_id: str) -> bool:
        async with self._lock:
            publisher = self._publishers.get(session_id)
            return publisher is not None and publisher.current_status in {
                "live",
                "live_recovered",
            }

    async def listener_count(self, session_id: str) -> int:
        async with self._lock:
            return len(self._listeners.get(session_id, set()))

    async def metrics_snapshot(self) -> dict[str, int]:
        async with self._lock:
            publisher_count = len(self._publishers)
            listener_count = sum(len(entries) for entries in self._listeners.values())
            session_count = len(set(self._publishers) | set(self._listeners))
        async with self._metrics_lock:
            values = vars(self.metrics).copy()
        values.update(
            {
                "active_publishers": publisher_count,
                "active_listeners": listener_count,
                "active_sessions": session_count,
            }
        )
        return values

    async def reset_metrics(self) -> None:
        async with self._metrics_lock:
            self.metrics = RelayMetrics()

    async def register_listener(
        self, session_id: str, websocket: WebSocket
    ) -> ListenerConnection:
        listener = ListenerConnection(websocket)
        async with self._lock:
            listener_count = sum(len(entries) for entries in self._listeners.values())
            if listener_count >= settings.relay_max_listeners:
                raise RelayProtocolError("Relay listener limit reached")
            self._listeners.setdefault(session_id, set()).add(listener)
            if self._poll_task is None or self._poll_task.done():
                self._event_cursor = await asyncio.to_thread(
                    relay_auth.latest_event_id
                )
                self._poll_task = asyncio.create_task(
                    self._poll_events(), name="relay-event-poller"
                )
        return listener

    async def unregister_listener(
        self, session_id: str, listener: ListenerConnection
    ) -> None:
        sender_task: asyncio.Task[None] | None = None
        poll_task: asyncio.Task[None] | None = None
        async with self._lock:
            listeners = self._listeners.get(session_id)
            if listeners is not None:
                listeners.discard(listener)
                if not listeners:
                    self._listeners.pop(session_id, None)
            listener.closed = True
            listener.pending.clear()
            listener.queued_audio_bytes = 0
            listener.pending_event.set()
            sender_task = listener.sender_task
            listener.sender_task = None
            if not self._listeners and self._poll_task is not None:
                poll_task = self._poll_task
                self._poll_task = None
                if poll_task is not asyncio.current_task():
                    poll_task.cancel()
        if (
            sender_task is not None
            and sender_task is not asyncio.current_task()
        ):
            sender_task.cancel()
            await asyncio.gather(sender_task, return_exceptions=True)
        if poll_task is not None and poll_task is not asyncio.current_task():
            await asyncio.gather(poll_task, return_exceptions=True)

    async def activate_listener(self, listener: ListenerConnection) -> None:
        async with listener.send_lock:
            async with self._lock:
                if listener.closed:
                    return
                pending = list(listener.pending)
                listener.pending.clear()
                listener.queued_audio_bytes = 0
                listener.ready = True
                listener.sender_task = asyncio.create_task(
                    self._run_listener_sender(listener),
                    name="relay-listener-sender",
                )
            for kind, payload in pending:
                await self._send_raw(listener.websocket, kind, payload)
                await self._record_sent(kind, payload)

    async def shutdown(self, reason: str = "server_shutdown") -> None:
        async with self._lock:
            session_ids = set(self._publishers) | set(self._listeners)
            publishers = list(self._publishers.values())
            listeners = [
                listener
                for entries in self._listeners.values()
                for listener in entries
            ]
            self._publishers.clear()
            self._listeners.clear()
            poll_task = self._poll_task
            self._poll_task = None
        if poll_task is not None:
            poll_task.cancel()
            await asyncio.gather(poll_task, return_exceptions=True)
        for session_id in session_ids:
            try:
                relay_auth.end_session(session_id)
            except RelayAuthError:
                pass
            await self._publish_event(
                session_id,
                "close",
                json.dumps({
                    "type": "status",
                    "session_id": session_id,
                    "sequence": 0,
                    "timestamp_ms": 0,
                    "status": "ended",
                    "reason": reason,
                }).encode("utf-8"),
            )
        await asyncio.gather(
            *(
                self._close(listener.websocket, 1001, "Server shutting down")
                for listener in listeners
            ),
            *(
                self._close(publisher.websocket, 1001, "Server shutting down")
                for publisher in publishers
            ),
            return_exceptions=True,
        )

    async def close_listeners(self, session_id: str, reason: str) -> None:
        async with self._lock:
            listeners = list(self._listeners.pop(session_id, ()))
        await self._publish_event(
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
        elif message_type == "scripture":
            if set(payload) != {
                "type",
                "session_id",
                "sequence",
                "timestamp_ms",
                "reference",
                "version",
                "verses",
            }:
                raise RelayProtocolError("Invalid scripture event")
            verses = payload.get("verses")
            if (
                not _is_nonnegative_int(payload.get("sequence"))
                or not _is_nonnegative_int(payload.get("timestamp_ms"))
                or not isinstance(payload.get("reference"), str)
                or not 1 <= len(payload["reference"]) <= 160
                or not isinstance(payload.get("version"), str)
                or not 1 <= len(payload["version"]) <= 80
                or not isinstance(verses, list)
                or not 1 <= len(verses) <= 100
                or any(
                    not isinstance(verse, dict)
                    or set(verse) != {"verse", "text"}
                    or not _is_positive_int(verse.get("verse"))
                    or not isinstance(verse.get("text"), str)
                    or not verse["text"]
                    or len(verse["text"]) > 1000
                    for verse in verses
                )
                or len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
                > 8 * 1024
            ):
                raise RelayProtocolError("Invalid scripture event")
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
            if message_type == "status":
                publisher.current_status = payload["status"]
        await self._publish_event(
            session_id, "json", json.dumps(payload).encode("utf-8")
        )
        encoded = json.dumps(payload).encode("utf-8")
        async with self._metrics_lock:
            self.metrics.control_events_received += 1
            self.metrics.control_event_bytes_received += len(encoded)

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
            await self._publish_event(
                session_id,
                "json",
                json.dumps({
                    "type": "audio_gap",
                    "session_id": session_id,
                    "sequence": sequence,
                }).encode("utf-8"),
            )
        await self._publish_event(session_id, "audio", frame)
        async with self._metrics_lock:
            self.metrics.audio_frames_received += 1
            self.metrics.audio_frame_bytes_received += len(frame)

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
        await self._publish_event(
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
                events = await asyncio.to_thread(
                    relay_auth.read_events_after, self._event_cursor
                )
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
        stale: list[ListenerConnection] = []
        async with self._lock:
            for listener in targets:
                if listener.closed:
                    continue
                if not await self._enqueue_listener_message(listener, kind, payload):
                    if kind == "bytes":
                        async with self._metrics_lock:
                            self.metrics.listener_queue_rejections += 1
                        stale.append(listener)
        if stale:
            await self._disconnect_slow_listeners(stale)

    async def _enqueue_listener_message(
        self, listener: ListenerConnection, kind: str, payload: Any
    ) -> bool:
        if kind == "bytes":
            payload_size = len(payload)
            while (
                payload_size <= self.max_pending_audio_bytes
                and listener.queued_audio_bytes + payload_size
                > self.max_pending_audio_bytes
            ):
                if not self._drop_oldest_queued_audio(listener):
                    break
                async with self._metrics_lock:
                    self.metrics.dropped_audio_frames += 1

            while len(listener.pending) >= self.max_pending_listener_messages:
                if not self._drop_oldest_queued_audio(listener):
                    break
                async with self._metrics_lock:
                    self.metrics.dropped_audio_frames += 1

            if (
                payload_size > self.max_pending_audio_bytes
                or listener.queued_audio_bytes + payload_size
                > self.max_pending_audio_bytes
                or len(listener.pending) >= self.max_pending_listener_messages
            ):
                async with self._metrics_lock:
                    self.metrics.dropped_audio_frames += 1
                return True
            listener.queued_audio_bytes += payload_size
        elif len(listener.pending) >= self.max_pending_listener_messages:
            return False

        listener.pending.append((kind, payload))
        if listener.ready:
            listener.pending_event.set()
        return True

    @staticmethod
    def _drop_oldest_queued_audio(listener: ListenerConnection) -> bool:
        oldest = next(
            (
                index
                for index, item in enumerate(listener.pending)
                if item[0] == "bytes"
            ),
            None,
        )
        if oldest is None:
            return False
        _, dropped = listener.pending[oldest]
        del listener.pending[oldest]
        listener.queued_audio_bytes -= len(dropped)
        return True

    async def _run_listener_sender(
        self, listener: ListenerConnection
    ) -> None:
        try:
            while True:
                await listener.pending_event.wait()
                while True:
                    async with self._lock:
                        if listener.closed:
                            return
                        if not listener.pending:
                            listener.pending_event.clear()
                            break
                        kind, payload = listener.pending.popleft()
                        if kind == "bytes":
                            listener.queued_audio_bytes -= len(payload)
                    async with listener.send_lock:
                        await self._send_raw(listener.websocket, kind, payload)
                    await self._record_sent(kind, payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            await self._disconnect_slow_listeners([listener])

    async def _disconnect_slow_listeners(
        self, listeners: list[ListenerConnection]
    ) -> None:
        async with self._metrics_lock:
            self.metrics.slow_listener_disconnects += len(listeners)
        for listener in listeners:
            async with self._lock:
                session_id = next(
                    (
                        session_id
                        for session_id, entries in self._listeners.items()
                        if listener in entries
                    ),
                    None,
                )
            if session_id is not None:
                await self.unregister_listener(session_id, listener)
        await asyncio.gather(
            *(
                self._close(listener.websocket, 1013, "Listener is too slow")
                for listener in listeners
            ),
            return_exceptions=True,
        )

    async def _publish_event(
        self, session_id: str, kind: str, payload: bytes
    ) -> None:
        await asyncio.to_thread(
            relay_auth.publish_event, session_id, kind, payload
        )

    async def _record_sent(self, kind: str, payload: Any) -> None:
        async with self._metrics_lock:
            if kind == "bytes":
                self.metrics.audio_frames_sent += 1
                self.metrics.audio_bytes_sent += len(payload)
            else:
                self.metrics.control_events_sent += 1
                self.metrics.control_event_bytes_sent += len(
                    json.dumps(payload).encode("utf-8")
                )

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


def _is_positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


relay_stream = RelayStreamService()
