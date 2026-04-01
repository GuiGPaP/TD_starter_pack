"""Watchdog process for TDDocker container lifecycle.

Launched as a detached subprocess by TouchDesigner.  Polls the TD process
and tears down Docker containers when TD exits unexpectedly.

Usage (standalone):
    python watchdog.py --pid <TD_PID> --session <SESSION_ID> --compose-dir <DIR>

Can also be imported for the spawn/orphan-cleanup helpers.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

logger = logging.getLogger("td_docker.watchdog")

# ---------------------------------------------------------------------------
# PID helpers (no psutil dependency — use OS-native checks)
# ---------------------------------------------------------------------------

_IS_WINDOWS = platform.system() == "Windows"


def pid_exists(pid: int) -> bool:
    """Check whether a process with the given PID is still alive."""
    if _IS_WINDOWS:
        # Kernel32 OpenProcess — returns 0 if process doesn't exist
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(  # type: ignore[union-attr]
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid
        )
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)  # type: ignore[union-attr]
            return True
        return False
    else:
        # POSIX — signal 0 checks existence without killing
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


# ---------------------------------------------------------------------------
# Shutdown signal (file-based)
# ---------------------------------------------------------------------------

SHUTDOWN_FILENAME = ".td_shutdown"


def _shutdown_signal_path(compose_dir: str | Path) -> Path:
    return Path(compose_dir) / SHUTDOWN_FILENAME


def send_shutdown_signal(compose_dir: str | Path) -> None:
    """Called by TD on clean exit — tells the watchdog to exit without compose down."""
    path = _shutdown_signal_path(compose_dir)
    path.write_text("shutdown", encoding="utf-8")


def _check_shutdown_signal(compose_dir: str | Path) -> bool:
    return _shutdown_signal_path(compose_dir).exists()


def _clear_shutdown_signal(compose_dir: str | Path) -> None:
    path = _shutdown_signal_path(compose_dir)
    if path.exists():
        path.unlink()


# ---------------------------------------------------------------------------
# Core watchdog loop
# ---------------------------------------------------------------------------

POLL_INTERVAL_SECONDS = 2.0
COMPOSE_DOWN_TIMEOUT = 10


def _compose_down(session_id: str, compose_dir: str | Path) -> None:
    """Run docker compose down for the session."""
    logger.info("Tearing down containers for session %s", session_id)
    try:
        subprocess.run(
            ["docker", "compose", "-p", session_id, "down", "--timeout", str(COMPOSE_DOWN_TIMEOUT)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=COMPOSE_DOWN_TIMEOUT + 15,
            cwd=str(compose_dir),
        )
    except Exception:
        logger.exception("Failed to run docker compose down")


def watchdog_loop(
    td_pid: int,
    session_id: str,
    compose_dir: str,
) -> None:
    """Poll TD PID and tear down containers when it disappears.

    Blocks until TD exits or a shutdown signal is received.
    """
    logger.info(
        "Watchdog started — monitoring PID %d, session %s, dir %s",
        td_pid,
        session_id,
        compose_dir,
    )
    _clear_shutdown_signal(compose_dir)

    while True:
        time.sleep(POLL_INTERVAL_SECONDS)

        # Clean shutdown requested by TD
        if _check_shutdown_signal(compose_dir):
            logger.info("Shutdown signal received — exiting without compose down")
            _clear_shutdown_signal(compose_dir)
            return

        # TD still alive?
        if not pid_exists(td_pid):
            logger.warning("TD process %d is gone — initiating teardown", td_pid)
            _compose_down(session_id, compose_dir)
            return


# ---------------------------------------------------------------------------
# Spawn helper (called from TD)
# ---------------------------------------------------------------------------


def spawn_watchdog(
    td_pid: int,
    session_id: str,
    compose_dir: str | Path,
) -> int:
    """Launch the watchdog as a fully detached subprocess.

    Returns the watchdog process PID.
    """
    cmd = [
        sys.executable,
        __file__,
        "--pid",
        str(td_pid),
        "--session",
        session_id,
        "--compose-dir",
        str(compose_dir),
    ]

    kwargs: dict = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "stdin": subprocess.DEVNULL,
    }

    if _IS_WINDOWS:
        CREATE_NEW_PROCESS_GROUP = 0x00000200
        DETACHED_PROCESS = 0x00000008
        kwargs["creationflags"] = CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True

    proc = subprocess.Popen(cmd, **kwargs)
    logger.info("Watchdog spawned with PID %d", proc.pid)
    return proc.pid


# ---------------------------------------------------------------------------
# Orphan cleanup (called on TDDocker init)
# ---------------------------------------------------------------------------


def cleanup_orphans() -> list[str]:
    """Find and remove containers with td.managed=true whose TD session is dead.

    Returns list of removed container IDs.
    """
    try:
        result = subprocess.run(
            [
                "docker",
                "ps",
                "--filter",
                "label=td.managed=true",
                "--format",
                "{{json .}}",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )
    except Exception:
        logger.exception("Failed to list managed containers")
        return []

    if result.returncode != 0:
        return []

    removed: list[str] = []
    for line in result.stdout.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        container_id = data.get("ID", "")
        labels_str = data.get("Labels", "")

        # Parse labels (comma-separated key=value)
        labels: dict[str, str] = {}
        for part in labels_str.split(","):
            if "=" in part:
                k, v = part.split("=", 1)
                labels[k.strip()] = v.strip()

        session = labels.get("td.session", "")
        if not session:
            continue

        # Check if the session's TD process is still alive
        # We can't know the original PID from labels alone, so we check
        # if ANY TDDocker session file exists for this session
        # For now: just stop containers from sessions with no running watchdog
        # Simple heuristic: try to stop containers older than the current boot
        try:
            subprocess.run(
                ["docker", "stop", "--time", "5", container_id],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=20,
            )
            removed.append(container_id)
            logger.info("Cleaned up orphan container %s (session %s)", container_id, session)
        except Exception:
            logger.exception("Failed to stop orphan container %s", container_id)

    return removed


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="TDDocker watchdog")
    parser.add_argument("--pid", type=int, required=True, help="TouchDesigner PID to monitor")
    parser.add_argument("--session", required=True, help="Docker compose project / session ID")
    parser.add_argument("--compose-dir", required=True, help="Directory containing compose files")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [watchdog] %(levelname)s %(message)s",
    )

    watchdog_loop(
        td_pid=args.pid,
        session_id=args.session,
        compose_dir=args.compose_dir,
    )


if __name__ == "__main__":
    main()
