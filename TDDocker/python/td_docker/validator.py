"""Security validation for docker-compose YAML files.

Rejects dangerous configurations before they reach Docker.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import PurePosixPath, PureWindowsPath
from typing import Any

import yaml


class Severity(Enum):
    ERROR = "error"
    WARNING = "warning"


@dataclass
class ValidationIssue:
    service: str
    rule: str
    message: str
    severity: Severity


# ---------------------------------------------------------------------------
# Deny-lists
# ---------------------------------------------------------------------------

_BLOCKED_CAPS: frozenset[str] = frozenset({
    "SYS_ADMIN",
    "SYS_PTRACE",
    "NET_ADMIN",
    "NET_RAW",
    "SYS_RAWIO",
    "SYS_MODULE",
})

_BLOCKED_VOLUME_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^/var/run/docker\.sock"),
    re.compile(r"^/etc(/|$)"),
    re.compile(r"^C:\\Windows", re.IGNORECASE),
    re.compile(r"^/proc(/|$)"),
    re.compile(r"^/sys(/|$)"),
]


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


def _check_privileged(service: str, svc_cfg: dict[str, Any]) -> list[ValidationIssue]:
    if svc_cfg.get("privileged") is True:
        return [
            ValidationIssue(
                service=service,
                rule="no-privileged",
                message="'privileged: true' is blocked — must not run in privileged mode",
                severity=Severity.ERROR,
            )
        ]
    return []


def _check_pid_mode(service: str, svc_cfg: dict[str, Any]) -> list[ValidationIssue]:
    if svc_cfg.get("pid") == "host":
        return [
            ValidationIssue(
                service=service,
                rule="no-pid-host",
                message="'pid: host' is blocked — containers must not share the host PID namespace",
                severity=Severity.ERROR,
            )
        ]
    return []


def _check_network_mode(service: str, svc_cfg: dict[str, Any]) -> list[ValidationIssue]:
    if svc_cfg.get("network_mode") == "host":
        return [
            ValidationIssue(
                service=service,
                rule="user-host-network",
                message=(
                    "'network_mode: host' set by user — TDDocker manages this for NDI. "
                    "Your setting will be overridden."
                ),
                severity=Severity.WARNING,
            )
        ]
    return []


def _normalize_volume_source(source: str) -> str:
    """Normalize a volume source to a forward-slash POSIX-style path."""
    # Handle Windows paths like C:\foo\bar
    if len(source) >= 2 and source[1] == ":":
        return str(PureWindowsPath(source))
    return str(PurePosixPath(source))


def _check_volumes(service: str, svc_cfg: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    volumes = svc_cfg.get("volumes", [])
    for vol in volumes:
        source = ""
        if isinstance(vol, str):
            # Short syntax: source:target[:mode]
            # Windows drive letters (C:\...) produce an extra split part
            parts = vol.split(":")
            if len(parts) >= 3 and len(parts[0]) == 1 and parts[0].isalpha():
                # Windows path: rejoin drive letter — e.g. ["C", "\\Windows", "/win"]
                source = parts[0] + ":" + parts[1]
            elif len(parts) >= 2:
                source = parts[0]
        elif isinstance(vol, dict):
            # Long syntax
            source = vol.get("source", "")

        if not source:
            continue

        normalized = _normalize_volume_source(source)
        for pattern in _BLOCKED_VOLUME_PATTERNS:
            if pattern.search(normalized) or pattern.search(source):
                issues.append(
                    ValidationIssue(
                        service=service,
                        rule="no-dangerous-volume",
                        message=f"Volume mount '{source}' is blocked — sensitive host path",
                        severity=Severity.ERROR,
                    )
                )
                break
    return issues


def _check_cap_add(service: str, svc_cfg: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    caps: list[str] = svc_cfg.get("cap_add", [])
    for cap in caps:
        cap_upper = cap.upper()
        if cap_upper in _BLOCKED_CAPS:
            issues.append(
                ValidationIssue(
                    service=service,
                    rule="no-dangerous-cap",
                    message=f"Capability '{cap}' is blocked — dangerous Linux capability",
                    severity=Severity.ERROR,
                )
            )
    return issues


def _check_devices(service: str, svc_cfg: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    devices: list[str] = svc_cfg.get("devices", [])
    for dev in devices:
        if dev.startswith("/dev/"):
            issues.append(
                ValidationIssue(
                    service=service,
                    rule="raw-device-access",
                    message=f"Device '{dev}' — raw device access may be dangerous",
                    severity=Severity.WARNING,
                )
            )
    return issues


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_ALL_CHECKS = [
    _check_privileged,
    _check_pid_mode,
    _check_network_mode,
    _check_volumes,
    _check_cap_add,
    _check_devices,
]


@dataclass
class ValidationResult:
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return any(i.severity == Severity.ERROR for i in self.issues)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.WARNING]


def validate_compose(yaml_content: str) -> ValidationResult:
    """Validate a docker-compose YAML string against security rules.

    Returns a ValidationResult with all issues found.
    Raises ValueError if the YAML is not a valid compose file.
    """
    try:
        doc = yaml.safe_load(yaml_content)
    except yaml.YAMLError as e:
        raise ValueError(f"Invalid YAML: {e}") from e

    if not isinstance(doc, dict):
        raise ValueError("Compose file must be a YAML mapping")

    services = doc.get("services")
    if not isinstance(services, dict):
        raise ValueError("Compose file must have a 'services' mapping")

    result = ValidationResult()
    for service_name, svc_cfg in services.items():
        if not isinstance(svc_cfg, dict):
            continue
        for check_fn in _ALL_CHECKS:
            result.issues.extend(check_fn(service_name, svc_cfg))

    return result


def validate_compose_file(path: str) -> ValidationResult:
    """Validate a docker-compose YAML file at the given path."""
    from pathlib import Path

    content = Path(path).read_text(encoding="utf-8")
    return validate_compose(content)
