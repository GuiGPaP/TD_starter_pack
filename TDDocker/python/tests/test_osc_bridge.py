"""Tests for OSC bridge (pure Python, no TD required)."""

from __future__ import annotations

from td_docker.transports.osc import CALLBACK_SCRIPT, OscBridge

# ---------------------------------------------------------------------------
# Message parsing
# ---------------------------------------------------------------------------


class TestParseMessage:
    def test_single_arg(self) -> None:
        bridge = OscBridge("test")
        row = bridge.parse_message("/sensor/temp", [22.5])
        assert row == {"address": "/sensor/temp", "arg0": "22.5"}

    def test_multiple_args(self) -> None:
        bridge = OscBridge("test")
        row = bridge.parse_message("/xy", [0.5, 0.8])
        assert row == {"address": "/xy", "arg0": "0.5", "arg1": "0.8"}

    def test_no_args(self) -> None:
        bridge = OscBridge("test")
        row = bridge.parse_message("/ping", [])
        assert row == {"address": "/ping"}

    def test_string_arg(self) -> None:
        bridge = OscBridge("test")
        row = bridge.parse_message("/label", ["hello"])
        assert row == {"address": "/label", "arg0": "hello"}

    def test_mixed_types(self) -> None:
        bridge = OscBridge("test")
        row = bridge.parse_message("/data", [1, 2.5, "foo", True])
        assert row == {
            "address": "/data",
            "arg0": "1",
            "arg1": "2.5",
            "arg2": "foo",
            "arg3": "True",
        }

    def test_empty_address(self) -> None:
        bridge = OscBridge("test")
        row = bridge.parse_message("", [42])
        assert row == {"address": "", "arg0": "42"}


# ---------------------------------------------------------------------------
# Header generation
# ---------------------------------------------------------------------------


class TestHeaderForArgs:
    def test_zero_args(self) -> None:
        assert OscBridge.header_for_args(0) == ["address"]

    def test_three_args(self) -> None:
        assert OscBridge.header_for_args(3) == [
            "address",
            "arg0",
            "arg1",
            "arg2",
        ]

    def test_one_arg(self) -> None:
        assert OscBridge.header_for_args(1) == ["address", "arg0"]


# ---------------------------------------------------------------------------
# Callback script
# ---------------------------------------------------------------------------


class TestCallbackScript:
    def test_script_is_valid_python(self) -> None:
        compile(CALLBACK_SCRIPT, "<osc_callback>", "exec")

    def test_script_imports_bridge(self) -> None:
        assert "OscBridge" in CALLBACK_SCRIPT

    def test_script_has_required_callback(self) -> None:
        assert "def onReceiveOSC" in CALLBACK_SCRIPT

    def test_script_uses_log_dat(self) -> None:
        assert "log_dat" in CALLBACK_SCRIPT
