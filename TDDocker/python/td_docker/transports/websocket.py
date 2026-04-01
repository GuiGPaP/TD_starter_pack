"""WebSocket data bridge — pure Python logic for TD WebSocket DAT integration.

Handles message parsing, connection state, and reconnection backoff.
No TouchDesigner imports — all TD interaction happens via td_container_ext.py.
"""

from __future__ import annotations

import json
from enum import Enum


class ConnectionState(Enum):
    """WebSocket connection state."""

    DISCONNECTED = "disconnected"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


class WebSocketBridge:
    """Manages WebSocket message parsing and connection state.

    Used by the TD callback script to parse incoming messages into
    table rows and handle reconnection logic.
    """

    def __init__(self, service_name: str, *, max_rows: int = 1000) -> None:
        self.service_name = service_name
        self.max_rows = max_rows
        self.state = ConnectionState.DISCONNECTED
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._base_delay = 1.0  # seconds

    def on_connect(self) -> str:
        """Handle connection. Returns log message."""
        self.state = ConnectionState.CONNECTED
        self._reconnect_attempts = 0
        return f"[{self.service_name}] WebSocket connected"

    def on_disconnect(self) -> tuple[str, float | None]:
        """Handle disconnection. Returns (log_msg, reconnect_delay_or_None)."""
        self.state = ConnectionState.DISCONNECTED
        delay = self._next_reconnect_delay()
        if delay is not None:
            self.state = ConnectionState.RECONNECTING
        return (f"[{self.service_name}] WebSocket disconnected", delay)

    def parse_message(self, raw: str) -> list[dict[str, str]]:
        """Parse a raw WebSocket message into table rows.

        - JSON object: [{"key": k, "value": str(v)} for each field]
        - JSON array of objects: [obj for each element]
        - Otherwise: [{"message": raw}]
        """
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return [{"message": raw}]

        if isinstance(data, dict):
            return [{"key": str(k), "value": str(v)} for k, v in data.items()]
        if isinstance(data, list):
            rows: list[dict[str, str]] = []
            for item in data:
                if isinstance(item, dict):
                    rows.append({str(k): str(v) for k, v in item.items()})
                else:
                    rows.append({"value": str(item)})
            return rows
        return [{"message": raw}]

    def reset(self) -> None:
        """Reset connection state and reconnect counter."""
        self.state = ConnectionState.DISCONNECTED
        self._reconnect_attempts = 0

    def _next_reconnect_delay(self) -> float | None:
        """Exponential backoff: 1s, 2s, 4s, 8s, 16s then give up."""
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            return None
        delay = self._base_delay * (2**self._reconnect_attempts)
        self._reconnect_attempts += 1
        return delay


# ---------------------------------------------------------------------------
# TD Callback Script — injected into a textDAT at runtime
# ---------------------------------------------------------------------------

CALLBACK_SCRIPT = """\
import sys
import os

_py = os.path.join(project.folder, 'python')
if _py not in sys.path:
    sys.path.insert(0, _py)

from td_docker.transports.websocket import WebSocketBridge

_bridge = None


def _get_bridge():
    global _bridge
    if _bridge is None:
        svc = parent().par.Servicename.eval() if hasattr(parent().par, 'Servicename') else 'unknown'
        _bridge = WebSocketBridge(svc)
    return _bridge


def onConnect(dat):
    msg = _get_bridge().on_connect()
    log = parent().op('log_dat')
    if log:
        log.text += msg + '\\n'


def onDisconnect(dat):
    msg, delay = _get_bridge().on_disconnect()
    log = parent().op('log_dat')
    if log:
        log.text += msg + '\\n'
    if delay is not None:
        run('args[0].par.active = True', dat, delayFrames=int(delay * me.time.rate))


def onReceiveText(dat, rowIndex, message, bytes):
    bridge = _get_bridge()
    log = parent().op('log_dat')
    if log:
        log.text += f'[{bridge.service_name}] WS: {message}\\n'
"""
