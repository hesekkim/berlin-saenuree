import asyncio
import json
import sqlite3
import threading
import time
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from core.config import Settings, settings
from api.v1.endpoints.relay import _expire_listener_token
from services import relay_stream_service as relay_stream_module
from main import app, create_application
from services.relay_auth_service import RelayAuthError, RelayAuthService, relay_auth
from services.relay_stream_service import RelayStreamService, relay_stream


@pytest.fixture(autouse=True)
def relay_settings(monkeypatch, tmp_path):
    relay_auth._db_path = tmp_path / "relay.sqlite3"
    relay_auth._initialized = False
    relay_stream._publishers.clear()
    relay_stream._listeners.clear()
    relay_stream._event_cursor = 0
    if relay_stream._poll_task is not None:
        relay_stream._poll_task.cancel()
        relay_stream._poll_task = None
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(
        settings,
        "relay_publisher_credential",
        "test-publisher-credential-with-32-chars",
    )
    monkeypatch.setattr(
        settings,
        "relay_listener_token_secret",
        "test-listener-token-secret-at-least-32",
    )
    monkeypatch.setattr(settings, "relay_listener_token_minutes", 15)
    monkeypatch.setattr(settings, "relay_allowed_origins", ["https://listener.vercel.app"])
    monkeypatch.setattr(settings, "relay_allowed_origin_suffixes", [])
    yield
    if relay_stream._poll_task is not None:
        relay_stream._poll_task.cancel()
        relay_stream._poll_task = None
    relay_stream._publishers.clear()
    relay_stream._listeners.clear()


def create_session(client: TestClient, session_id: str = "relay_session_123456"):
    return client.post(
        f"/api/v1/relay/sessions/{session_id}",
        headers={
            "X-Publisher-Credential": "test-publisher-credential-with-32-chars"
        },
    )


def publisher_hello(session_id: str) -> dict[str, object]:
    return {
        "type": "publisher_hello",
        "protocol": "sermon-live/1",
        "session_id": session_id,
        "codec": "opus",
        "container": "raw-opus",
        "sample_rate": 24000,
        "channels": 1,
        "packet_duration_ms": 20,
        "target_bitrate": 48000,
    }

@contextmanager
def live_publisher(client: TestClient, session_id: str):
    with client.websocket_connect(
        f"/api/v1/relay/ws/publisher/{session_id}",
        headers={
            "Origin": "",
            "X-Publisher-Credential": "test-publisher-credential-with-32-chars",
        },
    ) as publisher:
        publisher.send_json(publisher_hello(session_id))
        assert publisher.receive_json()["type"] == "publisher_ready"
        publisher.send_json(
            {
                "type": "status",
                "session_id": session_id,
                "sequence": 1,
                "timestamp_ms": 1000,
                "status": "live",
            }
        )
        yield publisher


def test_publisher_audio_frames_do_not_touch_the_session_store_per_frame(
    monkeypatch,
):
    client = TestClient(app)
    session_id = "relay_session_123456"
    assert create_session(client, session_id).status_code == 200
    touches = []
    original_touch = relay_auth.touch_publisher_session

    def counting_touch(*args):
        touches.append(args)
        return original_touch(*args)

    monkeypatch.setattr(relay_auth, "touch_publisher_session", counting_touch)

    with live_publisher(client, session_id) as publisher:
        for sequence in range(50):
            publisher.send_bytes(
                b"SL1A"
                + bytes((1, 0))
                + (1).to_bytes(2, "little")
                + (sequence * 20_000).to_bytes(8, "big")
                + sequence.to_bytes(4, "big")
                + b"x"
            )
        deadline = time.monotonic() + 5
        while (
            relay_stream.metrics.audio_frames_received < 50
            and time.monotonic() < deadline
        ):
            time.sleep(0.01)

    assert relay_stream.metrics.audio_frames_received >= 50
    assert len(touches) <= 1


class FakeWebSocket:
    def __init__(self):
        self.sent = []
        self.closed = []

    async def send_json(self, payload):
        self.sent.append(payload)

    async def send_bytes(self, payload):
        self.sent.append(payload)

    async def close(self, code, reason):
        self.closed.append((code, reason))


@pytest.mark.asyncio
async def test_forward_audio_does_not_block_event_loop_on_database_write(monkeypatch):
    session_id = "relay_session_123456"
    service = RelayStreamService()
    metadata = {
        "codec": "opus",
        "sample_rate": 24000,
        "channels": 1,
        "packet_duration_ms": 20,
    }
    await service.register_publisher(session_id, FakeWebSocket(), metadata)
    write_started = threading.Event()
    allow_write_to_finish = threading.Event()

    def slow_publish_event(*_args):
        write_started.set()
        allow_write_to_finish.wait(timeout=2)

    monkeypatch.setattr(
        relay_stream_module.relay_auth, "publish_event", slow_publish_event
    )
    payload = b"\x11" * 80
    frame = (
        b"SL1A"
        + bytes((1, 0))
        + len(payload).to_bytes(2, "little")
        + (0).to_bytes(8, "big")
        + (0).to_bytes(4, "big")
        + payload
    )
    task = asyncio.create_task(service.forward_audio(session_id, frame))
    try:
        assert await asyncio.wait_for(
            asyncio.to_thread(write_started.wait, 1), timeout=2
        )
        await asyncio.sleep(0)
        assert not task.done()
    finally:
        allow_write_to_finish.set()
    await task


def test_publisher_credential_is_required_to_create_a_session():
    client = TestClient(app)

    missing = client.post("/api/v1/relay/sessions/relay_session_123456")
    assert missing.status_code == 401

    created = create_session(client)
    assert created.status_code == 200
    session = relay_auth.get_session("relay_session_123456")
    assert session.session_version == 1
    with relay_auth._connection() as connection:
        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(relay_sessions)"
            ).fetchall()
        }
    assert columns == {
        "session_id",
        "session_version",
        "status",
        "metadata",
        "updated_at",
        "publisher_generation",
    }


def test_session_and_revocation_state_are_shared_by_service_instances(tmp_path):
    db_path = tmp_path / "shared.sqlite3"
    first = RelayAuthService(db_path)
    first._initialized = False
    session = first.upsert_session("relay_session_123456")
    token = first.issue_listener_token(session.session_id)

    second = RelayAuthService(db_path)
    assert second.get_session("relay_session_123456").session_version == 1
    second.verify_listener_token(token, "relay_session_123456")
    second.end_session("relay_session_123456")

    with pytest.raises(RelayAuthError):
        first.verify_listener_token(token, "relay_session_123456")


def test_legacy_password_columns_are_removed_during_session_database_migration(
    tmp_path,
):
    db_path = tmp_path / "legacy.sqlite3"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE relay_sessions (
            session_id TEXT PRIMARY KEY,
            password_salt TEXT NOT NULL,
            password_digest TEXT NOT NULL,
            password_version INTEGER NOT NULL,
            status TEXT NOT NULL,
            metadata TEXT,
            updated_at REAL NOT NULL DEFAULT 0,
            publisher_generation INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    connection.execute(
        """
        INSERT INTO relay_sessions
            (session_id, password_salt, password_digest, password_version,
             status, updated_at, publisher_generation)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        ("relay_session_123456", "old-salt", "old-digest", 4, "created", 1, 2),
    )
    connection.commit()
    connection.close()

    service = RelayAuthService(db_path)
    session = service.get_session("relay_session_123456")

    assert session.session_version == 4
    with service._connection() as migrated:
        columns = {
            row["name"]
            for row in migrated.execute(
                "PRAGMA table_info(relay_sessions)"
            ).fetchall()
        }
    assert "password_salt" not in columns
    assert "password_digest" not in columns
    assert "password_version" not in columns


@pytest.mark.asyncio
async def test_worker_event_bus_forwards_control_events_between_services():
    session_id = "relay_session_123456"
    relay_auth.upsert_session(session_id)
    publisher_generation = relay_auth.claim_publisher_session(session_id)
    relay_auth.set_session_metadata(
        session_id,
        {
            "codec": "opus",
            "sample_rate": 24000,
            "channels": 1,
            "packet_duration_ms": 20,
        },
    )
    publisher_service = RelayStreamService()
    listener_service = RelayStreamService()
    publisher_socket = FakeWebSocket()
    listener_socket = FakeWebSocket()
    await publisher_service.register_publisher(
        session_id, publisher_socket, await publisher_service.publisher_metadata(session_id)
    )
    listener = await listener_service.register_listener(session_id, listener_socket)
    await listener_service.activate_listener(listener)

    event = {
        "type": "subtitle",
        "session_id": session_id,
        "sequence": 1,
        "timestamp_ms": 1000,
        "language": "de",
        "text": "Guten Morgen",
    }
    await publisher_service.forward_control(session_id, event)
    for _ in range(50):
        if listener_socket.sent:
            break
        await asyncio.sleep(0.02)

    assert listener_socket.sent == [event]
    assert relay_auth.touch_publisher_session(session_id, publisher_generation)
    await listener_service.unregister_listener(session_id, listener)


@pytest.mark.asyncio
async def test_listener_activation_counts_queued_audio_and_control_sends():
    service = RelayStreamService()
    socket = FakeWebSocket()
    listener = await service.register_listener("relay_session_123456", socket)
    listener.audio_enabled = True
    audio_frame = b"synthetic-audio-frame"
    control_event = {"type": "subtitle", "text": "Test"}

    await service._send_to_listeners(
        [listener], "bytes", audio_frame, subscribed_audio_only=True
    )
    await service._send_to_listeners(
        [listener], "json", control_event, subscribed_audio_only=False
    )
    try:
        queued_metrics = await service.metrics_snapshot()
        assert queued_metrics["audio_bytes_sent"] == 0
        assert queued_metrics["control_events_sent"] == 0

        await service.activate_listener(listener)

        metrics = await service.metrics_snapshot()
        assert metrics["audio_frames_sent"] == 1
        assert metrics["audio_bytes_sent"] == len(audio_frame)
        assert metrics["control_events_sent"] == 1
        assert metrics["control_event_bytes_sent"] == len(
            json.dumps(control_event).encode("utf-8")
        )
    finally:
        await service.unregister_listener("relay_session_123456", listener)


@pytest.mark.asyncio
async def test_slow_listener_queue_drops_old_audio_without_delaying_other_listeners():
    class SlowAudioWebSocket(FakeWebSocket):
        def __init__(self):
            super().__init__()
            self.send_started = asyncio.Event()
            self.allow_send = asyncio.Event()

        async def send_bytes(self, payload):
            if not self.send_started.is_set():
                self.send_started.set()
                await self.allow_send.wait()
            await super().send_bytes(payload)

    session_id = "relay_session_123456"
    service = RelayStreamService(
        send_timeout_seconds=1,
        max_pending_listener_messages=2,
        max_pending_audio_bytes=1024,
    )
    slow_socket = SlowAudioWebSocket()
    fast_socket = FakeWebSocket()
    slow_listener = await service.register_listener(session_id, slow_socket)
    fast_listener = await service.register_listener(session_id, fast_socket)
    slow_listener.audio_enabled = True
    fast_listener.audio_enabled = True
    await service.activate_listener(slow_listener)
    await service.activate_listener(fast_listener)

    def audio_frame(sequence: int) -> bytes:
        payload = bytes([sequence + 1]) * 80
        return (
            b"SL1A"
            + bytes((1, 0))
            + len(payload).to_bytes(2, "little")
            + (sequence * 20_000).to_bytes(8, "big")
            + sequence.to_bytes(4, "big")
            + payload
        )

    try:
        for sequence in range(4):
            await service._send_to_listeners(
                [slow_listener, fast_listener],
                "bytes",
                audio_frame(sequence),
                subscribed_audio_only=True,
            )
            if sequence == 0:
                await asyncio.wait_for(slow_socket.send_started.wait(), timeout=1)
            for _ in range(50):
                if len(fast_socket.sent) == sequence + 1:
                    break
                await asyncio.sleep(0.01)
            assert len(fast_socket.sent) == sequence + 1

        assert slow_listener in service._listeners[session_id]
        assert slow_listener.queued_audio_bytes == 200
        metrics = await service.metrics_snapshot()
        assert metrics["dropped_audio_frames"] == 1
        assert metrics["slow_listener_disconnects"] == 0

        slow_socket.allow_send.set()
        for _ in range(50):
            if len(slow_socket.sent) == 3:
                break
            await asyncio.sleep(0.01)

        assert [int.from_bytes(frame[16:20], "big") for frame in slow_socket.sent] == [
            0,
            2,
            3,
        ]
    finally:
        slow_socket.allow_send.set()
        await service.unregister_listener(session_id, slow_listener)
        await service.unregister_listener(session_id, fast_listener)


def test_listener_token_is_session_bound_and_session_renewal_revokes_it():
    client = TestClient(app)
    create_session(client)
    with live_publisher(client, "relay_session_123456"):
        admitted = client.post(
            "/api/v1/relay/sessions/relay_session_123456/listener-token",
        )
        assert admitted.status_code == 200
        token = admitted.json()["listener_token"]

        relay_auth.verify_listener_token(token, "relay_session_123456")
        with pytest.raises(RelayAuthError):
            relay_auth.verify_listener_token(token, "relay_session_654321")

        changed = client.post(
            "/api/v1/relay/sessions/relay_session_123456",
            headers={
                "X-Publisher-Credential": "test-publisher-credential-with-32-chars"
            },
        )
        assert changed.status_code == 200
        with pytest.raises(RelayAuthError):
            relay_auth.verify_listener_token(token, "relay_session_123456")


def test_listener_token_is_issued_only_while_publisher_is_live():
    client = TestClient(app)
    session_id = "relay_session_123456"
    create_session(client, session_id)
    token_url = f"/api/v1/relay/sessions/{session_id}/listener-token"

    unavailable = client.post(token_url)
    assert unavailable.status_code == 409
    assert unavailable.json()["detail"] == "Broadcast is not currently live"

    unknown_session = client.post(
        "/api/v1/relay/sessions/relay_session_654321/listener-token"
    )
    assert unknown_session.status_code == 401
    assert unknown_session.json()["detail"] == "Invalid session"

    with client.websocket_connect(
        f"/api/v1/relay/ws/publisher/{session_id}",
        headers={
            "Origin": "",
            "X-Publisher-Credential": "test-publisher-credential-with-32-chars",
        },
    ) as publisher:
        publisher.send_json(publisher_hello(session_id))
        assert publisher.receive_json()["type"] == "publisher_ready"
        starting = client.post(token_url)
        assert starting.status_code == 409

        publisher.send_json(
            {
                "type": "status",
                "session_id": session_id,
                "sequence": 1,
                "timestamp_ms": 1000,
                "status": "live",
            }
        )
        admitted = client.post(token_url)
        publisher.send_json(
            {
                "type": "status",
                "session_id": session_id,
                "sequence": 2,
                "timestamp_ms": 1020,
                "status": "live_recovered",
            }
        )
        recovered = client.post(token_url)

    assert admitted.status_code == 200
    assert admitted.json()["listener_token"]
    assert recovered.status_code == 200
    assert recovered.json()["listener_token"]


def test_ended_session_cannot_issue_listener_tokens():
    client = TestClient(app)
    create_session(client)

    ended = client.post(
        "/api/v1/relay/sessions/relay_session_123456/end",
        headers={
            "X-Publisher-Credential": "test-publisher-credential-with-32-chars"
        },
    )
    assert ended.status_code == 200

    denied = client.post(
        "/api/v1/relay/sessions/relay_session_123456/listener-token",
    )
    assert denied.status_code == 409


def test_relay_metrics_require_publisher_auth_and_return_aggregate_metadata():
    client = TestClient(app)

    denied = client.get("/api/v1/relay/metrics")
    assert denied.status_code == 401

    response = client.get(
        "/api/v1/relay/metrics",
        headers={
            "X-Publisher-Credential": "test-publisher-credential-with-32-chars"
        },
    )
    assert response.status_code == 200
    metrics = response.json()
    assert "audio_bytes_sent" in metrics
    assert "slow_listener_disconnects" in metrics
    assert "active_listeners" in metrics
    assert "test-only-password" not in str(metrics)


def test_session_status_reports_the_authoritative_relay_state():
    client = TestClient(app)
    session_id = "relay_session_123456"
    create_session(client, session_id)
    headers = {
        "X-Publisher-Credential": "test-publisher-credential-with-32-chars"
    }

    created = client.get(
        f"/api/v1/relay/sessions/{session_id}/status",
        headers=headers,
    )
    assert created.status_code == 200
    assert created.json() == {
        "session_id": session_id,
        "status": "created",
        "listener_count": 0,
    }

    ended = client.post(
        f"/api/v1/relay/sessions/{session_id}/end",
        headers=headers,
    )
    assert ended.status_code == 200

    status = client.get(
        f"/api/v1/relay/sessions/{session_id}/status",
        headers=headers,
    )
    assert status.status_code == 200
    assert status.json() == {
        "session_id": session_id,
        "status": "ended",
        "listener_count": 0,
    }


def test_listener_token_and_websocket_attempts_are_rate_limited():
    for _ in range(100):
        assert relay_auth.allow_listener_token_request(
            "203.0.113.10", "relay_session_123456"
        )
    assert not relay_auth.allow_listener_token_request(
        "203.0.113.10", "relay_session_123456"
    )
    for _ in range(20):
        assert relay_auth.allow_ws_connection("203.0.113.11", "relay_session_123456")
    assert not relay_auth.allow_ws_connection(
        "203.0.113.11", "relay_session_123456"
    )


def test_origin_suffix_requires_a_subdomain_boundary():
    monkeypatch_values = ["vercel.app"]
    settings.relay_allowed_origin_suffixes = monkeypatch_values
    origin_probe = lambda origin: type(
        "OriginProbe", (), {"headers": {"origin": origin}}
    )()

    assert relay_auth.validate_origin(origin_probe("https://listener.vercel.app"))
    assert not relay_auth.validate_origin(origin_probe("https://attackervercel.app"))
    assert not relay_auth.validate_origin(
        origin_probe("https://listener.vercel.app.attacker.example")
    )


def test_listener_origins_are_allowed_for_password_endpoint_cors(monkeypatch):
    monkeypatch.setattr(settings, "allowed_origins", ["https://cms.example.com"])
    monkeypatch.setattr(
        settings,
        "relay_allowed_origins",
        ["https://listener.example.com"],
    )
    client = TestClient(create_application())

    response = client.options(
        "/api/v1/relay/sessions/relay_session_123456/listener-token",
        headers={
            "Origin": "https://listener.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert (
        response.headers["access-control-allow-origin"]
        == "https://listener.example.com"
    )


def test_listener_origin_suffix_is_allowed_for_password_endpoint_cors(monkeypatch):
    monkeypatch.setattr(settings, "allowed_origins", ["https://cms.example.com"])
    monkeypatch.setattr(settings, "relay_allowed_origins", [])
    monkeypatch.setattr(
        settings,
        "relay_allowed_origin_suffixes",
        ["vercel.app"],
    )
    client = TestClient(create_application())

    response = client.options(
        "/api/v1/relay/sessions/relay_session_123456/listener-token",
        headers={
            "Origin": "https://preview-branch.vercel.app",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert (
        response.headers["access-control-allow-origin"]
        == "https://preview-branch.vercel.app"
    )


def test_listener_token_lifetime_is_bounded():
    defaults = Settings(admin_emails=["admin@example.com"], _env_file=None)
    assert defaults.relay_listener_token_minutes == 90
    assert (
        Settings(
            admin_emails=["admin@example.com"],
            relay_listener_token_minutes=90,
            _env_file=None,
        ).relay_listener_token_minutes
        == 90
    )
    with pytest.raises(ValueError):
        Settings(
            admin_emails=["admin@example.com"],
            relay_listener_token_minutes=91,
            _env_file=None,
        )


def test_issued_listener_token_expires_after_ninety_minutes(monkeypatch):
    session_id = "relay_session_123456"
    session = relay_auth.upsert_session(session_id)
    monkeypatch.setattr(settings, "relay_listener_token_minutes", 90)
    issued_at = int(time.time())

    token = relay_auth.issue_listener_token(session_id)
    expires_at = relay_auth.verify_listener_token(token, session_id)

    assert 89 * 60 < expires_at - issued_at <= 90 * 60


@pytest.mark.asyncio
async def test_expired_listener_token_closes_existing_websocket():
    websocket = FakeWebSocket()

    await _expire_listener_token(websocket, int(time.time()) - 1)

    assert websocket.closed == [(1008, "Listener token expired")]


@pytest.mark.asyncio
async def test_relay_listener_queue_drops_oldest_audio_before_activation():
    service = RelayStreamService()
    service.max_pending_listener_messages = 256
    service.max_pending_audio_bytes = 2
    websocket = FakeWebSocket()
    listener = await service.register_listener("relay_session_123456", websocket)
    listener.audio_enabled = True

    await service._send_to_listeners(
        [listener], "bytes", b"a1", subscribed_audio_only=True
    )
    await service._send_to_listeners(
        [listener], "bytes", b"a2", subscribed_audio_only=True
    )
    await service._send_to_listeners(
        [listener], "json",
        {"type": "status", "session_id": "relay_session_123456"},
        subscribed_audio_only=False,
    )

    assert [kind for kind, _ in listener.pending] == ["bytes", "json"]
    assert listener.pending[-1][1]["type"] == "status"
    assert listener.pending[0][1] == b"a2"
    assert listener.queued_audio_bytes == 2
    await service.unregister_listener("relay_session_123456", listener)


def test_relay_session_limit_is_explicit(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "relay_max_sessions", 1)
    auth = RelayAuthService(tmp_path / "limits.sqlite3")
    auth.upsert_session("relay_session_123456")

    with pytest.raises(RelayAuthError, match="Relay session limit reached"):
        auth.upsert_session("relay_session_654321")


def test_publisher_and_listener_websockets_forward_control_and_audio():
    client = TestClient(app)
    session_id = "relay_session_123456"
    create_session(client, session_id)

    listener_path = f"/api/v1/relay/ws/listener/{session_id}"
    headers = {"X-Forwarded-For": "203.0.113.20"}
    with live_publisher(client, session_id) as publisher:
        admitted = client.post(
            f"/api/v1/relay/sessions/{session_id}/listener-token",
        )
        assert admitted.status_code == 200
        token = admitted.json()["listener_token"]
        with client.websocket_connect(
            listener_path,
            headers={
                **headers,
                "Origin": "https://listener.vercel.app",
            },
        ) as listener:
            listener.send_json(
                {
                    "type": "listener_hello",
                    "session_id": session_id,
                    "listener_token": token,
                }
            )
            ready = listener.receive_json()
            assert ready["type"] == "listener_ready"
            assert ready["status"] == "live"
            listener.send_json({"type": "audio", "enabled": True})

            subtitle = {
                "type": "subtitle",
                "session_id": session_id,
                "sequence": 1,
                "timestamp_ms": 1000,
                "language": "de",
                "text": "Guten Morgen",
            }
            publisher.send_json(subtitle)
            assert listener.receive_json() == subtitle

            scripture = {
                "type": "scripture",
                "session_id": session_id,
                "sequence": 2,
                "timestamp_ms": 1020,
                "reference": "Psalm 23:1",
                "version": "Lutherbibel 1912",
                "verses": [{"verse": 1, "text": "Der HERR ist mein Hirte."}],
            }
            publisher.send_json(scripture)
            assert listener.receive_json() == scripture

            audio_frame = (
                b"SL1A"
                + bytes((1, 0))
                + (4).to_bytes(2, "little")
                + (1000).to_bytes(8, "big")
                + (0).to_bytes(4, "big")
                + b"opus"
            )
            publisher.send_bytes(audio_frame)
            assert listener.receive_bytes() == audio_frame


def test_listener_origin_is_checked_and_ws_failures_count_toward_limit():
    client = TestClient(app)
    session_id = "relay_session_123456"
    create_session(client, session_id)

    assert not relay_auth.validate_origin(
        type("OriginProbe", (), {"headers": {"origin": "https://evil.example"}})()
    )
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/api/v1/relay/ws/listener/{session_id}",
            headers={
                "Origin": "https://evil.example",
                "X-Forwarded-For": "203.0.113.30",
            },
        ):
            pass

    with client.websocket_connect(
        f"/api/v1/relay/ws/listener/{session_id}",
        headers={
            "Origin": "https://listener.vercel.app",
            "X-Forwarded-For": "203.0.113.31",
        },
    ) as listener:
        listener.send_json(
            {
                "type": "listener_hello",
                "session_id": session_id,
                "listener_token": "invalid-token",
            }
        )
        with pytest.raises(WebSocketDisconnect):
            listener.receive_json()
    for _ in range(19):
        assert relay_auth.allow_ws_connection("203.0.113.31", session_id)
    assert not relay_auth.allow_ws_connection("203.0.113.31", session_id)
