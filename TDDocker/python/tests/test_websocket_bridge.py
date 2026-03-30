"""Tests for WebSocket bridge (pure Python, no TD required)."""

from __future__ import annotations

from td_docker.transports.websocket import (
    CALLBACK_SCRIPT,
    ConnectionState,
    WebSocketBridge,
)

# ---------------------------------------------------------------------------
# Message parsing
# ---------------------------------------------------------------------------


class TestParseMessage:
    def test_json_object(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message('{"x": 1, "y": 2}')
        assert rows == [
            {"key": "x", "value": "1"},
            {"key": "y", "value": "2"},
        ]

    def test_json_array_of_objects(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message('[{"a": "1"}, {"a": "2"}]')
        assert rows == [{"a": "1"}, {"a": "2"}]

    def test_json_array_of_primitives(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message("[1, 2, 3]")
        assert rows == [{"value": "1"}, {"value": "2"}, {"value": "3"}]

    def test_plain_text(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message("hello world")
        assert rows == [{"message": "hello world"}]

    def test_empty_string(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message("")
        assert rows == [{"message": ""}]

    def test_nested_json_stringified(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message('{"data": {"nested": true}}')
        assert rows == [
            {"key": "data", "value": "{'nested': True}"},
        ]

    def test_empty_json_object(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message("{}")
        assert rows == []

    def test_empty_json_array(self) -> None:
        bridge = WebSocketBridge("test")
        rows = bridge.parse_message("[]")
        assert rows == []


# ---------------------------------------------------------------------------
# Connection state
# ---------------------------------------------------------------------------


class TestConnectionState:
    def test_initial_state(self) -> None:
        bridge = WebSocketBridge("test")
        assert bridge.state == ConnectionState.DISCONNECTED

    def test_connect(self) -> None:
        bridge = WebSocketBridge("test")
        msg = bridge.on_connect()
        assert bridge.state == ConnectionState.CONNECTED
        assert "connected" in msg.lower()

    def test_disconnect_returns_delay(self) -> None:
        bridge = WebSocketBridge("test")
        bridge.on_connect()
        msg, delay = bridge.on_disconnect()
        assert bridge.state == ConnectionState.RECONNECTING
        assert delay == 1.0
        assert "disconnected" in msg.lower()

    def test_backoff_increases(self) -> None:
        bridge = WebSocketBridge("test")
        bridge.on_connect()
        delays: list[float | None] = []
        for _ in range(5):
            _, delay = bridge.on_disconnect()
            delays.append(delay)
            # Simulate failed reconnect — stays disconnected, no on_connect()
            bridge.state = ConnectionState.CONNECTED  # pretend reconnect started
        assert delays == [1.0, 2.0, 4.0, 8.0, 16.0]

    def test_max_attempts_returns_none(self) -> None:
        bridge = WebSocketBridge("test")
        bridge.on_connect()
        # Exhaust all 5 reconnect attempts without successful connect
        for _ in range(5):
            bridge.on_disconnect()
        # 6th disconnect — max attempts reached
        _, delay = bridge.on_disconnect()
        assert delay is None
        assert bridge.state == ConnectionState.DISCONNECTED

    def test_connect_resets_attempts(self) -> None:
        bridge = WebSocketBridge("test")
        # Accumulate some attempts
        for _ in range(3):
            bridge.on_connect()
            bridge.on_disconnect()
        # Connect resets the counter
        bridge.on_connect()
        _, delay = bridge.on_disconnect()
        assert delay == 1.0  # back to initial delay

    def test_reset(self) -> None:
        bridge = WebSocketBridge("test")
        bridge.on_connect()
        bridge.on_disconnect()
        bridge.reset()
        assert bridge.state == ConnectionState.DISCONNECTED
        assert bridge._reconnect_attempts == 0


# ---------------------------------------------------------------------------
# Callback script
# ---------------------------------------------------------------------------


class TestCallbackScript:
    def test_script_is_valid_python(self) -> None:
        compile(CALLBACK_SCRIPT, "<callback>", "exec")

    def test_script_imports_bridge(self) -> None:
        assert "WebSocketBridge" in CALLBACK_SCRIPT

    def test_script_has_required_callbacks(self) -> None:
        assert "def onConnect" in CALLBACK_SCRIPT
        assert "def onDisconnect" in CALLBACK_SCRIPT
        assert "def onReceiveText" in CALLBACK_SCRIPT
