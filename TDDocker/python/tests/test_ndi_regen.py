"""Tests for NDI overlay regeneration (orchestrator <-> container ext)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from td_docker.compose import ComposeResult, ServiceOverlay
from td_docker.td_docker_ext import TDDockerExt

_OVERLAY = Path("/fake/td-overlay.yml")
_YAML = "services:\n  web:\n    image: nginx\n"
_OK = ComposeResult(0, "", "")
_FAIL = ComposeResult(1, "", "network error")


def _make_ext(
    *,
    compose_path: str | None = "/fake/docker-compose.yml",
    overlay_path: str | None = "/fake/td-overlay.yml",
    services: dict[str, ServiceOverlay] | None = None,
) -> TDDockerExt:
    """Create a TDDockerExt with mocked ownerComp and pre-set state."""
    owner = MagicMock()
    owner.par.Composefile.eval.return_value = compose_path or ""
    owner.par.Sessionid = ""
    owner.par.Orphancleanup = False
    owner.op.return_value = None  # no log DAT

    with patch("td_docker.td_docker_ext.cleanup_orphans", return_value=[]):
        ext = TDDockerExt(owner)

    if compose_path:
        ext._compose_dir = Path(compose_path).parent
    if overlay_path:
        ext._overlay_path = Path(overlay_path)
    if services:
        ext._service_configs = services

    return ext


_WO = "td_docker.td_docker_ext.write_overlay"
_CU = "td_docker.td_docker_ext.compose_up"


# -------------------------------------------------------------------
# NotifyNdiChanged
# -------------------------------------------------------------------


class TestNotifyNdiChanged:
    def test_sets_flag_and_regenerates(self) -> None:
        ext = _make_ext(
            services={"web": ServiceOverlay(ndi_enabled=False)},
        )
        with (
            patch(_WO, return_value=_OVERLAY) as mock_write,
            patch(_CU, return_value=_OK) as mock_up,
            patch.object(Path, "exists", return_value=True),
            patch.object(Path, "read_text", return_value=_YAML),
        ):
            ext.NotifyNdiChanged("web", True)

        assert ext._service_configs["web"].ndi_enabled is True
        mock_write.assert_called_once()
        mock_up.assert_called_once()

    def test_disable_ndi(self) -> None:
        ext = _make_ext(
            services={"web": ServiceOverlay(ndi_enabled=True)},
        )
        with (
            patch(_WO, return_value=_OVERLAY),
            patch(_CU, return_value=_OK),
            patch.object(Path, "exists", return_value=True),
            patch.object(Path, "read_text", return_value=_YAML),
        ):
            ext.NotifyNdiChanged("web", False)

        assert ext._service_configs["web"].ndi_enabled is False

    def test_unknown_service_ignored(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})

        with (
            patch(_WO) as mock_write,
            patch(_CU) as mock_up,
        ):
            ext.NotifyNdiChanged("nonexistent", True)

        mock_write.assert_not_called()
        mock_up.assert_not_called()


# -------------------------------------------------------------------
# _regenerate_overlay edge cases
# -------------------------------------------------------------------


class TestRegenerateOverlay:
    def test_skipped_when_no_compose_path(self) -> None:
        ext = _make_ext(
            compose_path=None,
            services={"web": ServiceOverlay()},
        )
        ext._overlay_path = _OVERLAY

        with patch(_WO) as mock_write:
            ext._regenerate_overlay()

        mock_write.assert_not_called()

    def test_skipped_when_no_overlay_path(self) -> None:
        ext = _make_ext(
            overlay_path=None,
            services={"web": ServiceOverlay()},
        )
        with (
            patch(_WO) as mock_write,
            patch.object(Path, "exists", return_value=True),
        ):
            ext._regenerate_overlay()

        mock_write.assert_not_called()

    def test_compose_up_failure_logged(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})

        with (
            patch(_WO, return_value=_OVERLAY),
            patch(_CU, return_value=_FAIL),
            patch.object(Path, "exists", return_value=True),
            patch.object(Path, "read_text", return_value=_YAML),
        ):
            ext._regenerate_overlay()
        # Should not raise — failure is logged, not thrown
