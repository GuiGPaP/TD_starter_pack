"""Docker Compose overlay generation and execution.

Generates a TD overlay file and drives `docker compose` via subprocess.
Never modifies the user's original compose file.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .validator import validate_compose

# ---------------------------------------------------------------------------
# Overlay generation
# ---------------------------------------------------------------------------


@dataclass
class ServiceOverlay:
    """Per-service overlay configuration."""

    ndi_enabled: bool = False


@dataclass
class OverlayConfig:
    """Configuration for generating the TD overlay file."""

    session_id: str
    service_overrides: dict[str, ServiceOverlay] = field(default_factory=dict)


def generate_overlay(
    user_yaml: str,
    config: OverlayConfig,
) -> str:
    """Generate a docker-compose override YAML string.

    Args:
        user_yaml: The user's raw docker-compose YAML content.
        config: Overlay configuration (session ID, per-service options).

    Returns:
        A YAML string for the TD overlay file.

    Raises:
        ValueError: If the user YAML is invalid.
    """
    # Validate first — fail early
    result = validate_compose(user_yaml)
    if result.has_errors:
        msgs = "; ".join(f"[{i.service}] {i.message}" for i in result.errors)
        raise ValueError(f"Compose validation failed: {msgs}")

    doc = yaml.safe_load(user_yaml)
    services: dict[str, Any] = doc["services"]

    overlay_services: dict[str, Any] = {}
    any_bridge = False

    for svc_name in services:
        svc_override = config.service_overrides.get(svc_name, ServiceOverlay())

        svc_overlay: dict[str, Any] = {
            "labels": {
                "td.managed": "true",
                "td.session": config.session_id,
                "td.service": svc_name,
            },
        }

        if svc_override.ndi_enabled:
            svc_overlay["network_mode"] = "host"
        else:
            any_bridge = True

        overlay_services[svc_name] = svc_overlay

    overlay_doc: dict[str, Any] = {"services": overlay_services}

    if any_bridge:
        overlay_doc["networks"] = {
            "td_default": {"driver": "bridge"},
        }
        # Attach bridge network to non-host-mode services
        for _svc_name, svc_overlay in overlay_services.items():
            if "network_mode" not in svc_overlay:
                svc_overlay["networks"] = ["td_default"]

    return yaml.dump(overlay_doc, default_flow_style=False, sort_keys=False)


def write_overlay(
    user_yaml_path: str | Path,
    config: OverlayConfig,
    output_dir: str | Path | None = None,
) -> Path:
    """Generate and write the overlay file next to the user's compose file.

    Returns the path to the generated overlay file.
    """
    user_path = Path(user_yaml_path)
    user_content = user_path.read_text(encoding="utf-8")
    overlay_content = generate_overlay(user_content, config)

    if output_dir is None:
        output_dir = user_path.parent
    output_path = Path(output_dir) / "td-overlay.yml"
    output_path.write_text(overlay_content, encoding="utf-8")
    return output_path


# ---------------------------------------------------------------------------
# Compose execution
# ---------------------------------------------------------------------------


@dataclass
class ComposeResult:
    """Result of a docker compose command."""

    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


def _run_compose(
    args: list[str],
    project_name: str,
    timeout: int = 60,
) -> ComposeResult:
    """Run a docker compose command and capture output.

    Uses Popen + communicate() which reads stdout/stderr while waiting
    for the process to finish, avoiding the pipe-buffer deadlock that
    occurs with wait() + deferred read when output exceeds ~4 KB.
    """
    cmd = ["docker", "compose", "-p", project_name, *args]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout, stderr = proc.communicate()
        return ComposeResult(
            returncode=-1,
            stdout=stdout or "",
            stderr=(stderr or "") + "\ntimeout",
        )
    return ComposeResult(
        returncode=proc.returncode,
        stdout=stdout,
        stderr=stderr,
    )


def compose_up(
    user_yaml_path: str | Path,
    overlay_path: str | Path,
    project_name: str,
    *,
    detach: bool = True,
    timeout: int = 120,
) -> ComposeResult:
    """Run `docker compose up` with the user file and TD overlay."""
    args = [
        "-f",
        str(user_yaml_path),
        "-f",
        str(overlay_path),
        "up",
    ]
    if detach:
        args.append("-d")
    return _run_compose(args, project_name, timeout=timeout)


def compose_down(
    project_name: str,
    *,
    timeout: int = 30,
    volumes: bool = False,
) -> ComposeResult:
    """Run `docker compose down`."""
    args = ["down", "--timeout", str(timeout)]
    if volumes:
        args.append("--volumes")
    return _run_compose(args, project_name, timeout=timeout + 15)


@dataclass
class ContainerStatus:
    """Status of a single container."""

    service: str
    container_id: str
    state: str
    health: str
    image: str


def compose_ps(project_name: str) -> list[ContainerStatus]:
    """Get status of all containers in the project.

    Returns a list of ContainerStatus objects.
    """
    result = _run_compose(["ps", "-a", "--format", "json"], project_name, timeout=15)
    if not result.ok:
        return []

    containers: list[ContainerStatus] = []
    # docker compose ps --format json outputs one JSON object per line
    for line in result.stdout.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        containers.append(
            ContainerStatus(
                service=data.get("Service", ""),
                container_id=data.get("ID", ""),
                state=data.get("State", "unknown"),
                health=data.get("Health", ""),
                image=data.get("Image", ""),
            )
        )
    return containers


def compose_logs(
    project_name: str,
    service: str | None = None,
    *,
    tail: int = 100,
) -> ComposeResult:
    """Fetch logs from compose project or a specific service."""
    args = ["logs", "--tail", str(tail), "--no-color"]
    if service:
        args.append(service)
    return _run_compose(args, project_name, timeout=15)
