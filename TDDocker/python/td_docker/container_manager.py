"""Per-container lifecycle management.

Wraps individual docker commands (start/stop/restart/logs) for a single service.
Used by the TDContainerExt extension in each container COMP.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass


@dataclass
class CmdResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


def _run(cmd: list[str], timeout: int = 30) -> CmdResult:
    """Run a docker command. Uses Popen+wait instead of subprocess.run
    to avoid holding the GIL during the subprocess wait."""
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
    )
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        return CmdResult(-1, "", "timeout")
    return CmdResult(
        proc.returncode,
        proc.stdout.read() if proc.stdout else "",
        proc.stderr.read() if proc.stderr else "",
    )


def start_container(container_id: str) -> CmdResult:
    return _run(["docker", "start", container_id])


def stop_container(container_id: str, timeout: int = 10) -> CmdResult:
    return _run(["docker", "stop", "--time", str(timeout), container_id], timeout=timeout + 10)


def restart_container(container_id: str, timeout: int = 10) -> CmdResult:
    return _run(["docker", "restart", "--time", str(timeout), container_id], timeout=timeout + 10)


def container_logs(container_id: str, tail: int = 100) -> CmdResult:
    return _run(["docker", "logs", "--tail", str(tail), "--no-color", container_id], timeout=15)


def inspect_container(container_id: str) -> CmdResult:
    return _run(["docker", "inspect", "--format", "{{json .State}}", container_id], timeout=10)
