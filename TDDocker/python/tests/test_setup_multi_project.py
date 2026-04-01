"""Tests for _setup_multi_project and its extracted helpers."""

from __future__ import annotations

from unittest.mock import patch

from conftest import FakeOwnerComp, FakePage

from td_docker.td_docker_ext import TDDockerExt


def _make_ext(owner: FakeOwnerComp | None = None) -> TDDockerExt:
    """Build a TDDockerExt without triggering ``__init__``."""
    ext = object.__new__(TDDockerExt)
    ext.ownerComp = owner or FakeOwnerComp()  # type: ignore[assignment]
    return ext


# ------------------------------------------------------------------
# _find_page
# ------------------------------------------------------------------


def test_find_page_returns_matching_page():
    ext = _make_ext()
    page = FakePage("Config")
    ext.ownerComp.customPages.append(page)  # type: ignore[union-attr]
    assert ext._find_page("Config") is page


def test_find_page_returns_none_when_missing():
    ext = _make_ext()
    assert ext._find_page("Nonexistent") is None


# ------------------------------------------------------------------
# _ensure_projects_table
# ------------------------------------------------------------------


def test_ensure_projects_table_creates_when_missing():
    ext = _make_ext()
    ext._ensure_projects_table()
    owner = ext.ownerComp
    dat = owner.op("projects")  # type: ignore[union-attr]
    assert dat is not None
    assert dat.OPType == "tableDAT"
    assert dat._rows == [["project_name", "compose_path", "session_id", "status"]]
    assert dat.nodeX == 400
    assert dat.viewer is True


def test_ensure_projects_table_skips_when_exists():
    owner = FakeOwnerComp()
    existing = owner.create("tableDAT", "projects")
    ext = _make_ext(owner)
    ext._ensure_projects_table()
    # Still the same object, no second create
    assert owner.op("projects") is existing
    assert existing._rows == []  # no header added again


# ------------------------------------------------------------------
# _ensure_active_project_menu
# ------------------------------------------------------------------


def test_ensure_active_project_menu_creates_when_missing():
    owner = FakeOwnerComp()
    config = FakePage("Config", owner_par=owner.par)
    owner.customPages.append(config)
    ext = _make_ext(owner)

    ext._ensure_active_project_menu()
    assert hasattr(owner.par, "Activeproject")


def test_ensure_active_project_menu_skips_when_exists():
    owner = FakeOwnerComp()
    object.__setattr__(owner.par, "Activeproject", "already_set")
    config = FakePage("Config", owner_par=owner.par)
    owner.customPages.append(config)
    ext = _make_ext(owner)

    ext._ensure_active_project_menu()
    # Value unchanged — not recreated
    assert owner.par.Activeproject == "already_set"


# ------------------------------------------------------------------
# _ensure_action_pulses
# ------------------------------------------------------------------


def test_ensure_action_pulses_creates_when_missing():
    owner = FakeOwnerComp()
    actions = FakePage("Actions", owner_par=owner.par)
    owner.customPages.append(actions)
    ext = _make_ext(owner)

    ext._ensure_action_pulses()
    assert hasattr(owner.par, "Removeproject")
    assert hasattr(owner.par, "Upall")
    assert hasattr(owner.par, "Downall")


def test_ensure_action_pulses_skips_when_all_exist():
    owner = FakeOwnerComp()
    for name in ("Removeproject", "Upall", "Downall"):
        object.__setattr__(owner.par, name, "exists")
    actions = FakePage("Actions", owner_par=owner.par)
    owner.customPages.append(actions)
    ext = _make_ext(owner)

    ext._ensure_action_pulses()
    # Values unchanged
    assert owner.par.Removeproject == "exists"


def test_ensure_action_pulses_adds_only_missing():
    owner = FakeOwnerComp()
    object.__setattr__(owner.par, "Removeproject", "exists")
    actions = FakePage("Actions", owner_par=owner.par)
    owner.customPages.append(actions)
    ext = _make_ext(owner)

    ext._ensure_action_pulses()
    assert owner.par.Removeproject == "exists"  # untouched
    assert hasattr(owner.par, "Upall")
    assert hasattr(owner.par, "Downall")


# ------------------------------------------------------------------
# _ensure_library_page
# ------------------------------------------------------------------


def test_ensure_library_page_creates_new_page():
    ext = _make_ext()
    ext._ensure_library_page()
    owner = ext.ownerComp
    assert hasattr(owner.par, "Library")
    assert hasattr(owner.par, "Libraryproject")
    assert hasattr(owner.par, "Scanlibrary")
    assert hasattr(owner.par, "Loadfromlibrary")
    assert len(owner.customPages) == 1  # type: ignore[arg-type]
    assert owner.customPages[0].name == "Library"  # type: ignore[index]


def test_ensure_library_page_uses_existing_page():
    owner = FakeOwnerComp()
    lib = FakePage("Library", owner_par=owner.par)
    owner.customPages.append(lib)
    ext = _make_ext(owner)

    ext._ensure_library_page()
    # Still only one Library page
    assert len(owner.customPages) == 1
    assert hasattr(owner.par, "Library")


def test_ensure_library_page_adds_only_missing_params():
    owner = FakeOwnerComp()
    lib = FakePage("Library", owner_par=owner.par)
    owner.customPages.append(lib)
    # Simulate Library already present
    object.__setattr__(owner.par, "Library", "exists")
    ext = _make_ext(owner)

    ext._ensure_library_page()
    assert owner.par.Library == "exists"  # untouched
    assert hasattr(owner.par, "Libraryproject")  # created


# ------------------------------------------------------------------
# _ensure_status_display
# ------------------------------------------------------------------


def test_ensure_status_display_creates_when_missing():
    ext = _make_ext()
    ext._ensure_status_display()
    owner = ext.ownerComp
    sd = owner.op("status_display")  # type: ignore[union-attr]
    assert sd is not None
    assert sd.OPType == "textCOMP"
    assert sd.par.w == 480
    assert owner.par.opviewer is sd


def test_ensure_status_display_replaces_wrong_type():
    owner = FakeOwnerComp()
    old = owner.create("textTOP", "status_display")
    ext = _make_ext(owner)

    ext._ensure_status_display()
    assert old._destroyed is True
    sd = owner.op("status_display")
    assert sd is not None
    assert sd.OPType == "textCOMP"
    assert sd is not old


def test_ensure_status_display_keeps_correct_type():
    owner = FakeOwnerComp()
    existing = owner.create("textCOMP", "status_display")
    ext = _make_ext(owner)

    ext._ensure_status_display()
    assert owner.op("status_display") is existing
    assert existing._destroyed is False


# ------------------------------------------------------------------
# _setup_multi_project — idempotence end-to-end
# ------------------------------------------------------------------


def test_setup_multi_project_idempotent():
    """Calling _setup_multi_project twice must not duplicate anything."""
    owner = FakeOwnerComp()
    # Provide the pages the helpers expect
    config = FakePage("Config", owner_par=owner.par)
    actions = FakePage("Actions", owner_par=owner.par)
    owner.customPages.extend([config, actions])

    ext = _make_ext(owner)

    with (
        patch.object(ext, "_ensure_poll_script"),
        patch.object(ext, "_scan_library"),
        patch.object(ext, "_update_orchestrator_display"),
    ):
        ext._setup_multi_project()
        # Snapshot state after first call
        num_pages = len(owner.customPages)
        num_config_pars = len(config._pars)
        num_actions_pars = len(actions._pars)
        projects_rows = len(owner.op("projects")._rows)

        # Second call — nothing should change
        ext._setup_multi_project()
        assert len(owner.customPages) == num_pages
        assert len(config._pars) == num_config_pars
        assert len(actions._pars) == num_actions_pars
        assert len(owner.op("projects")._rows) == projects_rows
