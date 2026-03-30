"""Tests for watchdog module (unit-level, no Docker required)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from td_docker.watchdog import (
    SHUTDOWN_FILENAME,
    _check_shutdown_signal,
    _clear_shutdown_signal,
    cleanup_orphans,
    pid_exists,
    send_shutdown_signal,
)

# ---------------------------------------------------------------------------
# PID helpers
# ---------------------------------------------------------------------------


class TestPidExists:
    def test_current_process_exists(self) -> None:
        assert pid_exists(os.getpid()) is True

    def test_nonexistent_pid(self) -> None:
        # PID 4_000_000 is extremely unlikely to exist
        assert pid_exists(4_000_000) is False


# ---------------------------------------------------------------------------
# Shutdown signal (file-based)
# ---------------------------------------------------------------------------


class TestShutdownSignal:
    def test_send_and_check(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            assert not _check_shutdown_signal(tmpdir)

            send_shutdown_signal(tmpdir)
            assert _check_shutdown_signal(tmpdir)
            assert (Path(tmpdir) / SHUTDOWN_FILENAME).exists()

    def test_clear(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            send_shutdown_signal(tmpdir)
            assert _check_shutdown_signal(tmpdir)

            _clear_shutdown_signal(tmpdir)
            assert not _check_shutdown_signal(tmpdir)

    def test_clear_nonexistent_is_noop(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Should not raise
            _clear_shutdown_signal(tmpdir)


# ---------------------------------------------------------------------------
# Orphan cleanup (mocked — no Docker)
# ---------------------------------------------------------------------------


class TestOrphanCleanup:
    def test_no_containers_returns_empty(self) -> None:
        with patch("td_docker.watchdog.subprocess.run") as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = ""
            result = cleanup_orphans()
            assert result == []

    def test_subprocess_failure_returns_empty(self) -> None:
        with patch("td_docker.watchdog.subprocess.run") as mock_run:
            mock_run.return_value.returncode = 1
            mock_run.return_value.stdout = ""
            result = cleanup_orphans()
            assert result == []
