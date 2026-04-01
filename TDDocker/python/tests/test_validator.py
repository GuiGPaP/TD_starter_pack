"""Tests for YAML security validator."""

from __future__ import annotations

import pytest

from td_docker.validator import ValidationResult, validate_compose

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compose(services_block: str) -> str:
    return f"services:\n{services_block}"


def _assert_error(result: ValidationResult, rule: str) -> None:
    assert result.has_errors, f"Expected error with rule '{rule}' but got no errors"
    rules = [i.rule for i in result.errors]
    assert rule in rules, f"Expected rule '{rule}' in {rules}"


def _assert_warning(result: ValidationResult, rule: str) -> None:
    rules = [i.rule for i in result.warnings]
    assert rule in rules, f"Expected warning rule '{rule}' in {rules}"


def _assert_clean(result: ValidationResult) -> None:
    assert not result.has_errors, f"Expected clean result but got: {result.errors}"
    assert not result.warnings, f"Expected no warnings but got: {result.warnings}"


# ---------------------------------------------------------------------------
# Valid compose files
# ---------------------------------------------------------------------------


class TestValidCompose:
    def test_simple_service(self) -> None:
        result = validate_compose(
            _compose("  web:\n    image: nginx:latest\n    ports:\n      - '8080:80'\n")
        )
        _assert_clean(result)

    def test_multiple_services(self) -> None:
        result = validate_compose(
            _compose("  web:\n    image: nginx\n  db:\n    image: postgres\n")
        )
        _assert_clean(result)

    def test_safe_volumes(self) -> None:
        result = validate_compose(
            _compose("  app:\n    image: node\n    volumes:\n      - ./data:/app/data\n")
        )
        _assert_clean(result)


# ---------------------------------------------------------------------------
# Privileged
# ---------------------------------------------------------------------------


class TestPrivileged:
    def test_privileged_blocked(self) -> None:
        result = validate_compose(_compose("  evil:\n    image: alpine\n    privileged: true\n"))
        _assert_error(result, "no-privileged")

    def test_privileged_false_ok(self) -> None:
        result = validate_compose(_compose("  safe:\n    image: alpine\n    privileged: false\n"))
        _assert_clean(result)


# ---------------------------------------------------------------------------
# PID namespace
# ---------------------------------------------------------------------------


class TestPidMode:
    def test_pid_host_blocked(self) -> None:
        result = validate_compose(_compose("  svc:\n    image: alpine\n    pid: host\n"))
        _assert_error(result, "no-pid-host")


# ---------------------------------------------------------------------------
# Network mode
# ---------------------------------------------------------------------------


class TestNetworkMode:
    def test_user_host_network_warns(self) -> None:
        result = validate_compose(_compose("  svc:\n    image: alpine\n    network_mode: host\n"))
        _assert_warning(result, "user-host-network")
        assert not result.has_errors


# ---------------------------------------------------------------------------
# Dangerous volumes
# ---------------------------------------------------------------------------


class TestVolumes:
    def test_docker_socket_blocked(self) -> None:
        result = validate_compose(
            _compose(
                "  svc:\n    image: alpine\n    volumes:\n"
                "      - /var/run/docker.sock:/var/run/docker.sock\n"
            )
        )
        _assert_error(result, "no-dangerous-volume")

    def test_etc_blocked(self) -> None:
        result = validate_compose(
            _compose("  svc:\n    image: alpine\n    volumes:\n      - /etc:/host-etc\n")
        )
        _assert_error(result, "no-dangerous-volume")

    def test_proc_blocked(self) -> None:
        result = validate_compose(
            _compose("  svc:\n    image: alpine\n    volumes:\n      - /proc:/host-proc\n")
        )
        _assert_error(result, "no-dangerous-volume")

    def test_windows_system_blocked(self) -> None:
        result = validate_compose(
            _compose("  svc:\n    image: alpine\n    volumes:\n      - C:\\Windows:/win\n")
        )
        _assert_error(result, "no-dangerous-volume")

    def test_long_syntax_blocked(self) -> None:
        yaml_str = _compose(
            "  svc:\n"
            "    image: alpine\n"
            "    volumes:\n"
            "      - type: bind\n"
            "        source: /var/run/docker.sock\n"
            "        target: /var/run/docker.sock\n"
        )
        result = validate_compose(yaml_str)
        _assert_error(result, "no-dangerous-volume")


# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------


class TestCapabilities:
    @pytest.mark.parametrize("cap", ["SYS_ADMIN", "SYS_PTRACE", "NET_ADMIN", "NET_RAW"])
    def test_dangerous_cap_blocked(self, cap: str) -> None:
        result = validate_compose(
            _compose(f"  svc:\n    image: alpine\n    cap_add:\n      - {cap}\n")
        )
        _assert_error(result, "no-dangerous-cap")

    def test_safe_cap_ok(self) -> None:
        result = validate_compose(
            _compose("  svc:\n    image: alpine\n    cap_add:\n      - CHOWN\n")
        )
        _assert_clean(result)


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------


class TestDevices:
    def test_raw_device_warns(self) -> None:
        result = validate_compose(
            _compose("  svc:\n    image: alpine\n    devices:\n      - /dev/sda:/dev/sda\n")
        )
        _assert_warning(result, "raw-device-access")


# ---------------------------------------------------------------------------
# Invalid YAML
# ---------------------------------------------------------------------------


class TestInvalidInput:
    def test_not_yaml(self) -> None:
        with pytest.raises(ValueError, match="Invalid YAML"):
            validate_compose("{{not yaml}}: [")

    def test_not_mapping(self) -> None:
        with pytest.raises(ValueError, match="must be a YAML mapping"):
            validate_compose("- list\n- item\n")

    def test_no_services(self) -> None:
        with pytest.raises(ValueError, match="must have a 'services' mapping"):
            validate_compose("version: '3'\n")
