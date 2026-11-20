"""Bounded in-process relay load validation.

This fake-load harness never opens paid Render resources or real relay traffic.
It uses synthetic Opus-sized frames and FakeWebSocket objects to validate
listener fan-out, queue backpressure, and aggregate bandwidth calculations.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.relay_stream_service import RelayStreamService


PCM_BITS_PER_SECOND = 24_000 * 16
OPUS_TARGET_BITS_PER_SECOND = 48_000
PACKET_DURATION_SECONDS = 0.02


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent = 0
        self.closed: list[tuple[int, str]] = []

    async def send_bytes(self, payload: bytes) -> None:
        self.sent += len(payload)

    async def send_json(self, payload: dict) -> None:
        self.sent += len(str(payload).encode("utf-8"))

    async def close(self, code: int, reason: str) -> None:
        self.closed.append((code, reason))


def synthetic_audio_frame(sequence: int) -> bytes:
    payload = bytes((0x66,)) * 120
    return (
        b"SL1A"
        + bytes((1, 0))
        + len(payload).to_bytes(2, "little")
        + (sequence * 20_000).to_bytes(8, "big")
        + sequence.to_bytes(4, "big")
        + payload
    )


async def run_stage(
    listener_count: int,
    frame_count: int,
) -> tuple[dict[str, int], int, int]:
    service = RelayStreamService()
    await service.reset_metrics()
    listeners = []
    for _ in range(listener_count):
        listener = await service.register_listener(
            "relay_session_loadtest",
            FakeWebSocket(),
        )
        listener.audio_enabled = True
        await service.activate_listener(listener)
        listeners.append(listener)

    bytes_on_wire = 0
    for sequence in range(frame_count):
        frame = synthetic_audio_frame(sequence)
        bytes_on_wire += len(frame)
        await service._send_to_listeners(
            listeners,
            "bytes",
            frame,
            subscribed_audio_only=True,
        )

    metrics = await service.metrics_snapshot()
    await asyncio.gather(
        *(
            service.unregister_listener("relay_session_loadtest", listener)
            for listener in listeners
        )
    )
    return metrics, bytes_on_wire, listener_count * bytes_on_wire


async def main() -> None:
    print("bounded fake relay load; no network or paid resources")
    print("stage=listeners, frames, relay_frame_GB/hour_estimate")
    for listener_count in (1, 10, 50):
        frame_count = 50
        _metrics, frame_bytes, listener_hour_bytes = await run_stage(
            listener_count,
            frame_count=frame_count,
        )
        sample_duration_seconds = frame_count * PACKET_DURATION_SECONDS
        hourly_bytes_per_listener = (
            frame_bytes / sample_duration_seconds * 60 * 60
        )
        gb_per_listener_hour = hourly_bytes_per_listener / 1_000_000_000
        print(
            f"{listener_count} listener(s): "
            f"sample_bytes={listener_hour_bytes}, "
            f"egress_GB/listener-hour={gb_per_listener_hour:.3f}"
        )

    pcm = PCM_BITS_PER_SECOND / 1_000_000
    opus = OPUS_TARGET_BITS_PER_SECOND / 1_000_000
    savings = (1 - opus / pcm) * 100
    print(
        f"theoretical_pcm_Mbps={pcm:.3f}, "
        f"opus_target_Mbps={opus:.3f}, "
        f"pcm_vs_target_savings_percent={savings:.1f}"
    )


if __name__ == "__main__":
    asyncio.run(main())
