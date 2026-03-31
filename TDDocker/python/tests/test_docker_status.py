"""Tests for Docker availability check and auto-launch."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

from td_docker.docker_status import check_docker, start_docker_desktop

# ---------------------------------------------------------------------------
# check_docker
# ---------------------------------------------------------------------------


def _mock_popen(returncode: int = 0, stderr: str = "", stdout: str = ""):
    """Create a mock Popen that works with wait() + pipe reads."""
    from io import StringIO

    proc = MagicMock()
    proc.returncode = returncode
    proc.stdout = StringIO(stdout)
    proc.stderr = StringIO(stderr)
    proc.wait = MagicMock()
    return proc


class TestCheckDocker:
    def test_docker_running(self) -> None:
        proc = _mock_popen(returncode=0)
        with patch("td_docker.docker_status.subprocess.Popen", return_value=proc):
            status = check_docker()
        assert status.available is True
        assert "running" in status.message.lower()

    def test_daemon_not_running(self) -> None:
        proc = _mock_popen(
            returncode=1,
            stderr="Cannot connect to the Docker daemon",
        )
        with patch("td_docker.docker_status.subprocess.Popen", return_value=proc):
            status = check_docker()
        assert status.available is False
        assert "Start Docker" in status.message

    def test_connection_refused(self) -> None:
        proc = _mock_popen(returncode=1, stderr="connection refused")
        with patch("td_docker.docker_status.subprocess.Popen", return_value=proc):
            status = check_docker()
        assert status.available is False

    def test_docker_cli_not_found(self) -> None:
        with patch(
            "td_docker.docker_status.subprocess.Popen",
            side_effect=FileNotFoundError,
        ):
            status = check_docker()
        assert status.available is False
        assert "not found" in status.message.lower()

    def test_timeout(self) -> None:
        proc = _mock_popen()
        # First wait(timeout=10) raises, second wait() (after kill) succeeds
        proc.wait = MagicMock(
            side_effect=[
                subprocess.TimeoutExpired(cmd="docker", timeout=10),
                None,
            ],
        )
        proc.kill = MagicMock()
        with patch("td_docker.docker_status.subprocess.Popen", return_value=proc):
            status = check_docker()
        assert status.available is False
        assert "timeout" in status.message.lower()

    def test_unknown_error(self) -> None:
        proc = _mock_popen(returncode=1, stderr="something unexpected")
        with patch("td_docker.docker_status.subprocess.Popen", return_value=proc):
            status = check_docker()
        assert status.available is False
        assert "something unexpected" in status.message


# ---------------------------------------------------------------------------
# start_docker_desktop
# ---------------------------------------------------------------------------


class TestStartDockerDesktop:
    def test_unsupported_platform(self) -> None:
        with patch("td_docker.docker_status.platform.system", return_value="Linux"):
            msg = start_docker_desktop()
        assert "not supported" in msg.lower()

    def test_windows_exe_found(self) -> None:
        with (
            patch("td_docker.docker_status.platform.system", return_value="Windows"),
            patch("td_docker.docker_status.Path.exists", return_value=True),
            patch("td_docker.docker_status.subprocess.Popen") as mock_popen,
        ):
            msg = start_docker_desktop()
        mock_popen.assert_called_once()
        assert "launching" in msg.lower()

    def test_windows_exe_not_found(self) -> None:
        with (
            patch("td_docker.docker_status.platform.system", return_value="Windows"),
            patch("td_docker.docker_status.Path.exists", return_value=False),
        ):
            msg = start_docker_desktop()
        assert "not found" in msg.lower()

    def test_macos_app_found(self) -> None:
        with (
            patch("td_docker.docker_status.platform.system", return_value="Darwin"),
            patch("td_docker.docker_status.Path.exists", return_value=True),
            patch("td_docker.docker_status.subprocess.Popen") as mock_popen,
        ):
            msg = start_docker_desktop()
        mock_popen.assert_called_once()
        assert "launching" in msg.lower()

    def test_macos_app_not_found(self) -> None:
        with (
            patch("td_docker.docker_status.platform.system", return_value="Darwin"),
            patch("td_docker.docker_status.Path.exists", return_value=False),
        ):
            msg = start_docker_desktop()
        assert "not found" in msg.lower()

    def test_windows_launch_failure(self) -> None:
        with (
            patch("td_docker.docker_status.platform.system", return_value="Windows"),
            patch("td_docker.docker_status.Path.exists", return_value=True),
            patch(
                "td_docker.docker_status.subprocess.Popen",
                side_effect=OSError("access denied"),
            ),
        ):
            msg = start_docker_desktop()
        assert "failed" in msg.lower()
