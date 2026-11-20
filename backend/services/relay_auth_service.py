from __future__ import annotations

import hmac
import json
import re
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import jwt
from fastapi import WebSocket

from core.config import settings


SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
LISTENER_TOKEN_AUDIENCE = "sermon-live-listener"
PUBLISHER_TOKEN_AUDIENCE = "sermon-live-publisher"
RATE_WINDOW_SECONDS = 60
LISTENER_TOKEN_SESSION_REQUEST_LIMIT = 100
LISTENER_TOKEN_IP_REQUEST_LIMIT = 500
WEBSOCKET_ATTEMPT_LIMIT = 20
WEBSOCKET_IP_ATTEMPT_LIMIT = 100


class RelayAuthError(Exception):
    pass


class RelayLimitError(RelayAuthError):
    pass


@dataclass
class RelaySession:
    session_id: str
    session_version: int
    status: str = "created"


class RelayAuthService:
    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or (settings.data_dir / "relay_auth.sqlite3")
        self._lock = threading.RLock()
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._db_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        if not self._initialized:
            with self._lock:
                if not self._initialized:
                    connection.execute("PRAGMA journal_mode = WAL")
                    connection.executescript(
                        """
                        CREATE TABLE IF NOT EXISTS relay_sessions (
                            session_id TEXT PRIMARY KEY,
                            session_version INTEGER NOT NULL DEFAULT 0,
                            status TEXT NOT NULL,
                            metadata TEXT,
                            updated_at REAL NOT NULL DEFAULT 0,
                            publisher_generation INTEGER NOT NULL DEFAULT 0
                        );
                        CREATE TABLE IF NOT EXISTS relay_attempts (
                            id INTEGER PRIMARY KEY,
                            kind TEXT NOT NULL,
                            client_ip TEXT NOT NULL,
                            session_id TEXT NOT NULL,
                            attempted_at REAL NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS relay_attempts_lookup
                            ON relay_attempts(kind, client_ip, session_id, attempted_at);
                        CREATE TABLE IF NOT EXISTS relay_events (
                            id INTEGER PRIMARY KEY,
                            session_id TEXT NOT NULL,
                            kind TEXT NOT NULL,
                            payload BLOB NOT NULL,
                            created_at REAL NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS relay_events_created
                            ON relay_events(created_at);
                        """
                    )
                    columns = {
                        row["name"]
                        for row in connection.execute(
                            "PRAGMA table_info(relay_sessions)"
                        ).fetchall()
                    }
                    if "metadata" not in columns:
                        try:
                            connection.execute(
                                "ALTER TABLE relay_sessions ADD COLUMN metadata TEXT"
                            )
                        except sqlite3.OperationalError as error:
                            if "duplicate column name" not in str(error).lower():
                                raise
                    if "updated_at" not in columns:
                        try:
                            connection.execute(
                                "ALTER TABLE relay_sessions ADD COLUMN updated_at REAL NOT NULL DEFAULT 0"
                            )
                        except sqlite3.OperationalError as error:
                            if "duplicate column name" not in str(error).lower():
                                raise
                    if "publisher_generation" not in columns:
                        try:
                            connection.execute(
                                "ALTER TABLE relay_sessions ADD COLUMN publisher_generation INTEGER NOT NULL DEFAULT 0"
                            )
                        except sqlite3.OperationalError as error:
                            if "duplicate column name" not in str(error).lower():
                                raise
                    if "session_version" not in columns:
                        connection.execute(
                            "ALTER TABLE relay_sessions ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0"
                        )
                        if "password_version" in columns:
                            connection.execute(
                                "UPDATE relay_sessions SET session_version = password_version"
                            )
                    legacy_password_columns = {
                        "password_salt",
                        "password_digest",
                        "password_version",
                    }.intersection(columns)
                    if legacy_password_columns:
                        connection.commit()
                        connection.execute("BEGIN IMMEDIATE")
                        connection.execute(
                            """
                            CREATE TABLE relay_sessions_migration (
                                session_id TEXT PRIMARY KEY,
                                session_version INTEGER NOT NULL DEFAULT 0,
                                status TEXT NOT NULL,
                                metadata TEXT,
                                updated_at REAL NOT NULL DEFAULT 0,
                                publisher_generation INTEGER NOT NULL DEFAULT 0
                            )
                            """
                        )
                        connection.execute(
                            """
                            INSERT INTO relay_sessions_migration
                                (session_id, session_version, status, metadata,
                                 updated_at, publisher_generation)
                            SELECT session_id, session_version, status, metadata,
                                   updated_at, publisher_generation
                            FROM relay_sessions
                            """
                        )
                        connection.execute("DROP TABLE relay_sessions")
                        connection.execute(
                            "ALTER TABLE relay_sessions_migration RENAME TO relay_sessions"
                        )
                        connection.execute(
                            "DELETE FROM relay_attempts WHERE kind = 'password'"
                        )
                        connection.commit()
                    self._initialized = True
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def validate_session_id(self, session_id: str) -> str:
        if not SESSION_ID_RE.fullmatch(session_id):
            raise RelayAuthError("Invalid session")
        return session_id

    def validate_publisher_credential(self, credential: str | None) -> None:
        configured = settings.relay_publisher_credential
        if (
            len(configured) < 32
            or credential is None
            or not hmac.compare_digest(
                configured.encode("utf-8"), credential.encode("utf-8")
            )
        ):
            raise RelayAuthError("Publisher authentication failed")

    @staticmethod
    def _canonical_origin(value: str) -> tuple[str, str] | None:
        parsed = urlparse(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            return None
        try:
            port = parsed.port
        except ValueError:
            return None
        host = parsed.hostname.lower().rstrip(".")
        default_port = 80 if parsed.scheme == "http" else 443
        netloc = host if port in (None, default_port) else f"{host}:{port}"
        return parsed.scheme.lower(), netloc

    def validate_origin(self, websocket: WebSocket) -> bool:
        origin = websocket.headers.get("origin")
        if not origin:
            return False
        canonical = self._canonical_origin(origin)
        if canonical is None:
            return False
        scheme, netloc = canonical
        hostname = (urlparse(origin).hostname or "").lower().rstrip(".")
        if settings.debug and hostname in {"localhost", "127.0.0.1", "::1"}:
            return True

        allowed_exact = {
            parsed
            for value in settings.relay_allowed_origins
            if (parsed := self._canonical_origin(value)) is not None
        }
        if canonical in allowed_exact:
            return True
        if scheme != "https":
            return False
        return any(
            hostname == suffix.lower().lstrip(".").rstrip(".")
            or hostname.endswith("." + suffix.lower().lstrip(".").rstrip("."))
            for suffix in settings.relay_allowed_origin_suffixes
            if suffix.strip()
        )

    @staticmethod
    def _to_session(row: sqlite3.Row) -> RelaySession:
        return RelaySession(
            session_id=row["session_id"],
            session_version=row["session_version"],
            status=row["status"],
        )

    def upsert_session(self, session_id: str) -> RelaySession:
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT session_version FROM relay_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is None:
                count_row = connection.execute(
                    "SELECT COUNT(*) AS count FROM relay_sessions WHERE status != 'ended'"
                ).fetchone()
                if count_row["count"] >= settings.relay_max_sessions:
                    raise RelayLimitError("Relay session limit reached")
            version = 1 if row is None else row["session_version"] + 1
            connection.execute(
                """
                INSERT INTO relay_sessions
                    (session_id, session_version, status, updated_at, publisher_generation)
                VALUES (?, ?, 'created', ?, 0)
                ON CONFLICT(session_id) DO UPDATE SET
                    session_version = excluded.session_version,
                    status = excluded.status,
                    updated_at = excluded.updated_at,
                    publisher_generation = relay_sessions.publisher_generation + 1,
                    metadata = NULL
                """,
                (session_id, version, time.time()),
            )
        return RelaySession(session_id, version)

    def set_session_status(self, session_id: str, status: str) -> None:
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE relay_sessions SET status = ?, updated_at = ? WHERE session_id = ?",
                (status, time.time(), session_id),
            )
        if cursor.rowcount == 0:
            raise RelayAuthError("Session not found")

    def claim_publisher_session(self, session_id: str) -> int:
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE relay_sessions
                SET status = 'live', updated_at = ?,
                    publisher_generation = publisher_generation + 1
                WHERE session_id = ? AND status != 'ended'
                """,
                (time.time(), session_id),
            )
            if cursor.rowcount == 0:
                raise RelayAuthError("Session unavailable")
            row = connection.execute(
                "SELECT publisher_generation FROM relay_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return row["publisher_generation"]

    def touch_publisher_session(self, session_id: str, generation: int) -> bool:
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE relay_sessions SET updated_at = ?
                WHERE session_id = ? AND status = 'live'
                    AND publisher_generation = ?
                """,
                (time.time(), session_id, generation),
            )
        return cursor.rowcount > 0

    def release_publisher_session(self, session_id: str, generation: int) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                UPDATE relay_sessions SET status = 'created', updated_at = ?
                WHERE session_id = ? AND status = 'live'
                    AND publisher_generation = ?
                """,
                (time.time(), session_id, generation),
            )

    def publisher_session_is_active(self, session_id: str) -> bool:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT status, updated_at FROM relay_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is None or row["status"] != "live":
                return False
            if row["updated_at"] > time.time() - 45:
                return True
            connection.execute(
                "UPDATE relay_sessions SET status = 'created' WHERE session_id = ?",
                (session_id,),
            )
        return False

    def set_session_metadata(self, session_id: str, metadata: dict[str, object]) -> None:
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE relay_sessions SET metadata = ? WHERE session_id = ?",
                (json.dumps(metadata), session_id),
            )
        if cursor.rowcount == 0:
            raise RelayAuthError("Session not found")

    def get_session_metadata(self, session_id: str) -> dict[str, object] | None:
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            row = connection.execute(
                "SELECT metadata FROM relay_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None or row["metadata"] is None:
            return None
        value = json.loads(row["metadata"])
        return value if isinstance(value, dict) else None

    def end_session(self, session_id: str) -> None:
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE relay_sessions
                SET status = 'ended', updated_at = ?,
                    publisher_generation = publisher_generation + 1,
                    metadata = NULL
                WHERE session_id = ?
                """,
                (time.time(), session_id),
            )
        if cursor.rowcount == 0:
            raise RelayAuthError("Session not found")

    def get_session(self, session_id: str) -> RelaySession:
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM relay_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            raise RelayAuthError("Session not found")
        return self._to_session(row)

    def allow_listener_token_request(self, client_ip: str, session_id: str) -> bool:
        now = time.time()
        session_id = self.validate_session_id(session_id)
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM relay_attempts WHERE attempted_at <= ?",
                (now - RATE_WINDOW_SECONDS,),
            )
            per_session = connection.execute(
                """
                SELECT COUNT(*) AS count FROM relay_attempts
                WHERE kind = 'listener_token' AND client_ip = ? AND session_id = ?
                    AND attempted_at > ?
                """,
                (client_ip, session_id, now - RATE_WINDOW_SECONDS),
            ).fetchone()["count"]
            per_ip = connection.execute(
                """
                SELECT COUNT(*) AS count FROM relay_attempts
                WHERE kind = 'listener_token' AND client_ip = ? AND attempted_at > ?
                """,
                (client_ip, now - RATE_WINDOW_SECONDS),
            ).fetchone()["count"]
            if (
                per_session >= LISTENER_TOKEN_SESSION_REQUEST_LIMIT
                or per_ip >= LISTENER_TOKEN_IP_REQUEST_LIMIT
            ):
                return False
            connection.execute(
                """
                INSERT INTO relay_attempts(kind, client_ip, session_id, attempted_at)
                VALUES ('listener_token', ?, ?, ?)
                """,
                (client_ip, session_id, now),
            )
        return True

    def allow_ws_connection(self, client_ip: str, session_id: str) -> bool:
        now = time.time()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM relay_attempts WHERE attempted_at <= ?",
                (now - RATE_WINDOW_SECONDS,),
            )
            per_session = connection.execute(
                """
                SELECT COUNT(*) AS count FROM relay_attempts
                WHERE kind = 'websocket' AND client_ip = ? AND session_id = ?
                    AND attempted_at > ?
                """,
                (client_ip, session_id[:128], now - RATE_WINDOW_SECONDS),
            ).fetchone()["count"]
            per_ip = connection.execute(
                """
                SELECT COUNT(*) AS count FROM relay_attempts
                WHERE kind = 'websocket' AND client_ip = ? AND attempted_at > ?
                """,
                (client_ip, now - RATE_WINDOW_SECONDS),
            ).fetchone()["count"]
            if per_session >= WEBSOCKET_ATTEMPT_LIMIT or per_ip >= WEBSOCKET_IP_ATTEMPT_LIMIT:
                return False
            connection.execute(
                """
                INSERT INTO relay_attempts(kind, client_ip, session_id, attempted_at)
                VALUES ('websocket', ?, ?, ?)
                """,
                (client_ip, session_id[:128], now),
            )
        return True

    def latest_event_id(self) -> int:
        with self._connection() as connection:
            row = connection.execute("SELECT COALESCE(MAX(id), 0) AS id FROM relay_events").fetchone()
        return row["id"]

    def publish_event(self, session_id: str, kind: str, payload: bytes) -> None:
        session_id = self.validate_session_id(session_id)
        now = time.time()
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO relay_events(session_id, kind, payload, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, kind, payload, now),
            )
            connection.execute(
                "DELETE FROM relay_events WHERE created_at <= ?",
                (now - 120,),
            )

    def read_events_after(
        self, event_id: int, limit: int = 1000
    ) -> list[tuple[int, str, str, bytes]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT id, session_id, kind, payload
                FROM relay_events WHERE id > ? ORDER BY id LIMIT ?
                """,
                (event_id, limit),
            ).fetchall()
        return [
            (row["id"], row["session_id"], row["kind"], bytes(row["payload"]))
            for row in rows
        ]

    def issue_listener_token(self, session_id: str) -> str:
        session = self.get_session(session_id)
        if session.status not in {"created", "live"}:
            raise RelayAuthError("Session unavailable")
        secret = settings.relay_listener_token_secret
        if len(secret) < 32:
            raise RelayAuthError("Relay listener token secret is not configured")
        now = datetime.now(timezone.utc)
        minutes = max(1, settings.relay_listener_token_minutes)
        claims = {
            "sub": session.session_id,
            "aud": LISTENER_TOKEN_AUDIENCE,
            "typ": "relay_listener",
            "iss": "sermon-live-relay",
            "iat": now,
            "exp": now + timedelta(minutes=minutes),
            "session_version": session.session_version,
        }
        return jwt.encode(claims, secret, algorithm="HS256")

    def verify_listener_token(self, token: str | None, session_id: str) -> int:
        session_id = self.validate_session_id(session_id)
        session = self.get_session(session_id)
        if session.status not in {"created", "live"}:
            raise RelayAuthError("Session unavailable")
        secret = settings.relay_listener_token_secret
        if not token or len(secret) < 32:
            raise RelayAuthError("Listener authentication failed")
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience=LISTENER_TOKEN_AUDIENCE,
                issuer="sermon-live-relay",
                options={
                    "require": [
                        "sub",
                        "exp",
                        "iat",
                        "aud",
                        "iss",
                        "typ",
                        "session_version",
                    ]
                },
            )
        except jwt.InvalidTokenError as error:
            raise RelayAuthError("Listener authentication failed") from error
        if (
            payload.get("sub") != session_id
            or payload.get("typ") != "relay_listener"
            or payload.get("session_version") != session.session_version
        ):
            raise RelayAuthError("Listener authentication failed")
        expiration = payload.get("exp")
        if not isinstance(expiration, int):
            raise RelayAuthError("Listener authentication failed")
        return expiration

    def verify_publisher_authorization(
        self, authorization: str | None, session_id: str | None = None
    ) -> None:
        if not authorization or not authorization.startswith("Bearer "):
            raise RelayAuthError("Publisher authentication failed")
        token = authorization.removeprefix("Bearer ").strip()
        secret = settings.relay_listener_token_secret
        if len(secret) < 32:
            raise RelayAuthError("Publisher authentication failed")
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience=PUBLISHER_TOKEN_AUDIENCE,
                issuer="sermon-live-relay",
            )
        except jwt.InvalidTokenError as error:
            raise RelayAuthError("Publisher authentication failed") from error
        if payload.get("typ") != "relay_publisher":
            raise RelayAuthError("Publisher authentication failed")
        if session_id is not None and payload.get("sub") != session_id:
            raise RelayAuthError("Publisher authentication failed")


relay_auth = RelayAuthService()
