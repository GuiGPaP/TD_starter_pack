"""Docker daemon availability check and auto-launch.

Provides functions to check if Docker is running and to start
Docker Desktop on supported platforms.
"""

from __future__ import annotations

import platform
import subprocess
from dataclasses import dataclass
from pathlib import Path

# Common Docker Desktop install paths per platform
_DOCKER_DESKTOP_PATHS: dict[str, list[str]] = {
    "Windows": [
        r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
    ],
    "Darwin": [
        "/Applications/Docker.app/Contents/MacOS/Docker Desktop",
        "/Applications/Docker.app",
    ],
}


@dataclass
class DockerStatus:
    """Result of a Docker availability check."""

    available: bool
    message: str
    cli_missing: bool = False


def check_docker() -> DockerStatus:
    """Check if the Docker daemon is reachable.

    Runs ``docker info`` with a short timeout. Any successful response
    (even with warnings) means Docker is available.
    """
    try:
        proc = subprocess.Popen(
            ["docker", "info"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            return DockerStatus(
                False,
                "Docker daemon not responding (timeout). "
                "Press 'Start Docker' to launch Docker Desktop.",
            )
        if proc.returncode == 0:
            return DockerStatus(True, "Docker is running")
        # docker CLI found but daemon not responding
        stderr = (proc.stderr.read() if proc.stderr else "").strip()
        stderr_lower = stderr.lower()
        if (
            "cannot connect" in stderr_lower
            or "connection refused" in stderr_lower
            or "failed to connect" in stderr_lower
        ):
            return DockerStatus(
                False,
                "Docker CLI found but daemon is not running. "
                "Press 'Start Docker' to launch Docker Desktop.",
            )
        return DockerStatus(False, f"Docker error: {stderr[:200]}")
    except FileNotFoundError:
        return DockerStatus(
            False,
            "Docker CLI not found. "
            "Install Docker Desktop: https://docker.com/products/docker-desktop/",
            cli_missing=True,
        )


def start_docker_desktop() -> str:
    """Attempt to launch Docker Desktop.

    Returns a status message describing what happened.
    """
    system = platform.system()

    if system == "Windows":
        return _start_windows()
    if system == "Darwin":
        return _start_macos()
    return (
        "Auto-launch is not supported on this platform. "
        "Please start Docker manually."
    )


def _start_windows() -> str:
    """Launch Docker Desktop on Windows."""
    for path in _DOCKER_DESKTOP_PATHS.get("Windows", []):
        if Path(path).exists():
            try:
                # CREATE_NEW_PROCESS_GROUP so it doesn't die with TD
                subprocess.Popen(
                    [path],
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
                    | subprocess.DETACHED_PROCESS,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return (
                    f"Docker Desktop launching from {path}. "
                    "It may take 15-30s to be ready."
                )
            except OSError as e:
                return f"Failed to launch Docker Desktop: {e}"

    return (
        "Docker Desktop not found at the default location. "
        r"Expected: C:\Program Files\Docker\Docker\Docker Desktop.exe"
    )


def _start_macos() -> str:
    """Launch Docker Desktop on macOS."""
    app_path = Path("/Applications/Docker.app")
    if app_path.exists():
        try:
            subprocess.Popen(
                ["open", "-a", "Docker"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return (
                "Docker Desktop launching. "
                "It may take 15-30s to be ready."
            )
        except OSError as e:
            return f"Failed to launch Docker Desktop: {e}"

    return (
        "Docker Desktop not found at /Applications/Docker.app. "
        "Install from https://docker.com/products/docker-desktop/"
    )
