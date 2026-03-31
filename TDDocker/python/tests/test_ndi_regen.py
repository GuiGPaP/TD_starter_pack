"""Tests for NDI overlay regeneration (orchestrator <-> container ext)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from td_docker.compose import ComposeResult, ServiceOverlay
from td_docker.td_docker_ext import ProjectState, TDDockerExt

_CD = "td_docker.td_docker_ext.compose_down"

_OVERLAY = Path("/fake/td-overlay.yml")
_YAML = "services:\n  web:\n    image: nginx\n"
_OK = ComposeResult(0, "", "")
_FAIL = ComposeResult(1, "", "network error")


def _make_ext(
    *,
    project_name: str = "testproj",
    compose_path: str | None = "/fake/docker-compose.yml",
    overlay_path: str | None = "/fake/td-overlay.yml",
    services: dict[str, ServiceOverlay] | None = None,
) -> TDDockerExt:
    """Create a TDDockerExt with mocked ownerComp and a pre-set project."""
    owner = MagicMock()
    owner.par.Composefile.eval.return_value = compose_path or ""
    owner.par.Orphancleanup = False
    owner.op.return_value = None  # no log DAT
    owner.customPages = []

    with patch("td_docker.td_docker_ext.cleanup_orphans", return_value=[]):
        ext = TDDockerExt(owner)

    # Run _enqueue_task inline for deterministic test execution.
    ext._sync_mode = True

    if services:
        project = ProjectState(
            name=project_name,
            compose_path=Path(compose_path) if compose_path else Path("/fake"),
            compose_dir=Path(compose_path).parent if compose_path else Path("/fake"),
            session_id="abc123",
            overlay_path=Path(overlay_path) if overlay_path else None,
            service_configs=services,
        )
        ext._projects[project_name] = project

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
            ext.NotifyNdiChanged("testproj", "web", True)

        assert ext._projects["testproj"].service_configs["web"].ndi_enabled is True
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
            ext.NotifyNdiChanged("testproj", "web", False)

        assert ext._projects["testproj"].service_configs["web"].ndi_enabled is False

    def test_unknown_service_ignored(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})

        with (
            patch(_WO) as mock_write,
            patch(_CU) as mock_up,
        ):
            ext.NotifyNdiChanged("testproj", "nonexistent", True)

        mock_write.assert_not_called()
        mock_up.assert_not_called()

    def test_unknown_project_ignored(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})

        with (
            patch(_WO) as mock_write,
            patch(_CU) as mock_up,
        ):
            ext.NotifyNdiChanged("unknown_project", "web", True)

        mock_write.assert_not_called()
        mock_up.assert_not_called()


# -------------------------------------------------------------------
# _regenerate_overlay edge cases
# -------------------------------------------------------------------


class TestRegenerateOverlay:
    def test_skipped_when_no_overlay_path(self) -> None:
        ext = _make_ext(
            overlay_path=None,
            services={"web": ServiceOverlay()},
        )
        with (
            patch(_WO) as mock_write,
            patch.object(Path, "exists", return_value=True),
        ):
            project = ext._projects["testproj"]
            ext._regenerate_overlay(project)

        mock_write.assert_not_called()

    def test_compose_up_failure_logged(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})

        with (
            patch(_WO, return_value=_OVERLAY),
            patch(_CU, return_value=_FAIL),
            patch.object(Path, "exists", return_value=True),
            patch.object(Path, "read_text", return_value=_YAML),
        ):
            project = ext._projects["testproj"]
            ext._regenerate_overlay(project)
        # Should not raise — failure is logged, not thrown


# -------------------------------------------------------------------
# Lifecycle chaining (_remove_project / _rebuild)
# -------------------------------------------------------------------


class TestLifecycleChaining:
    """Verify that remove/rebuild defer cleanup until down completes."""

    def test_remove_running_project_chains_after_down(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})
        ext.ownerComp.par.Activeproject.eval.return_value = "testproj"
        project = ext._projects["testproj"]
        project.status = "running"
        project.session_id = "abc123"

        with (
            patch(_CD, return_value=_OK),
            patch("td_docker.td_docker_ext.send_shutdown_signal"),
        ):
            ext._remove_project()

        # Project should be removed from registry after down completes
        assert "testproj" not in ext._projects

    def test_remove_stopped_project_cleans_immediately(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})
        ext.ownerComp.par.Activeproject.eval.return_value = "testproj"
        project = ext._projects["testproj"]
        project.status = "stopped"

        with patch(_CD) as mock_down:
            ext._remove_project()

        # Down should not be called for stopped projects
        mock_down.assert_not_called()
        assert "testproj" not in ext._projects

    def test_rebuild_running_project_chains_after_down(self) -> None:
        ext = _make_ext(services={"web": ServiceOverlay()})
        ext.ownerComp.par.Activeproject.eval.return_value = "testproj"
        project = ext._projects["testproj"]
        project.status = "running"
        project.session_id = "abc123"

        with (
            patch(_CD, return_value=_OK),
            patch("td_docker.td_docker_ext.send_shutdown_signal"),
            patch.object(ext, "_load"),
            patch.object(ext, "_up"),
        ):
            ext._rebuild()

        # Old project removed; _load() + _up() called after down
        assert "testproj" not in ext._projects
