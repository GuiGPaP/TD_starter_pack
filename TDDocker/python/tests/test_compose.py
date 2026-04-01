"""Tests for compose overlay generation and subprocess wrapper."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest
import yaml

from td_docker.compose import (
    ComposeResult,
    OverlayConfig,
    ServiceOverlay,
    _run_compose,
    generate_overlay,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SIMPLE_COMPOSE = """\
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
  api:
    image: myapp:latest
    ports:
      - "3000:3000"
"""

_SINGLE_SERVICE = """\
services:
  ml:
    image: pytorch-model:latest
"""


def _parse_overlay(user_yaml: str, config: OverlayConfig) -> dict:
    overlay_str = generate_overlay(user_yaml, config)
    return yaml.safe_load(overlay_str)


# ---------------------------------------------------------------------------
# Label injection
# ---------------------------------------------------------------------------


class TestLabels:
    def test_all_services_get_labels(self) -> None:
        cfg = OverlayConfig(session_id="test-session-123")
        doc = _parse_overlay(_SIMPLE_COMPOSE, cfg)

        for svc_name in ("web", "api"):
            labels = doc["services"][svc_name]["labels"]
            assert labels["td.managed"] == "true"
            assert labels["td.session"] == "test-session-123"
            assert labels["td.service"] == svc_name

    def test_session_id_propagated(self) -> None:
        cfg = OverlayConfig(session_id="abc-xyz")
        doc = _parse_overlay(_SINGLE_SERVICE, cfg)
        assert doc["services"]["ml"]["labels"]["td.session"] == "abc-xyz"


# ---------------------------------------------------------------------------
# NDI / network mode
# ---------------------------------------------------------------------------


class TestNdiOverlay:
    def test_ndi_service_gets_host_mode(self) -> None:
        cfg = OverlayConfig(
            session_id="s1",
            service_overrides={"ml": ServiceOverlay(ndi_enabled=True)},
        )
        doc = _parse_overlay(_SINGLE_SERVICE, cfg)
        assert doc["services"]["ml"]["network_mode"] == "host"

    def test_non_ndi_service_gets_bridge(self) -> None:
        cfg = OverlayConfig(session_id="s1")
        doc = _parse_overlay(_SINGLE_SERVICE, cfg)
        assert "network_mode" not in doc["services"]["ml"]
        assert "td_default" in doc.get("networks", {})
        assert "td_default" in doc["services"]["ml"]["networks"]

    def test_mixed_ndi_and_bridge(self) -> None:
        cfg = OverlayConfig(
            session_id="s1",
            service_overrides={"web": ServiceOverlay(ndi_enabled=True)},
        )
        doc = _parse_overlay(_SIMPLE_COMPOSE, cfg)

        # web → host mode, no network list
        assert doc["services"]["web"]["network_mode"] == "host"
        assert "networks" not in doc["services"]["web"]

        # api → bridge network
        assert "network_mode" not in doc["services"]["api"]
        assert "td_default" in doc["services"]["api"]["networks"]

        # Global bridge network exists (because api needs it)
        assert "td_default" in doc["networks"]

    def test_all_ndi_no_bridge_network(self) -> None:
        cfg = OverlayConfig(
            session_id="s1",
            service_overrides={
                "web": ServiceOverlay(ndi_enabled=True),
                "api": ServiceOverlay(ndi_enabled=True),
            },
        )
        doc = _parse_overlay(_SIMPLE_COMPOSE, cfg)
        assert "networks" not in doc


# ---------------------------------------------------------------------------
# Validation integration
# ---------------------------------------------------------------------------


class TestValidationIntegration:
    def test_privileged_rejected(self) -> None:
        bad_yaml = "services:\n  evil:\n    image: alpine\n    privileged: true\n"
        cfg = OverlayConfig(session_id="s1")
        with pytest.raises(ValueError, match=r"(?i)privileged"):
            generate_overlay(bad_yaml, cfg)

    def test_valid_passes_through(self) -> None:
        cfg = OverlayConfig(session_id="s1")
        # Should not raise
        result = generate_overlay(_SIMPLE_COMPOSE, cfg)
        assert "td.managed" in result


# ---------------------------------------------------------------------------
# _run_compose subprocess wrapper
# ---------------------------------------------------------------------------


class TestRunCompose:
    @patch("td_docker.compose.subprocess.Popen")
    def test_success(self, mock_popen_cls: MagicMock) -> None:
        proc = MagicMock()
        proc.communicate.return_value = ('{"ok":true}\n', "")
        proc.returncode = 0
        mock_popen_cls.return_value = proc

        result = _run_compose(["ps", "--format", "json"], "myproject")

        assert isinstance(result, ComposeResult)
        assert result.ok
        assert result.returncode == 0
        assert result.stdout == '{"ok":true}\n'
        assert result.stderr == ""
        proc.communicate.assert_called_once_with(timeout=60)

    @patch("td_docker.compose.subprocess.Popen")
    def test_timeout_kills_process(self, mock_popen_cls: MagicMock) -> None:
        proc = MagicMock()
        proc.communicate.side_effect = [
            subprocess.TimeoutExpired(cmd="docker", timeout=10),
            ("partial", "err"),
        ]
        mock_popen_cls.return_value = proc

        result = _run_compose(["up", "-d"], "myproject", timeout=10)

        assert not result.ok
        assert result.returncode == -1
        assert "timeout" in result.stderr
        assert result.stdout == "partial"
        proc.kill.assert_called_once()
