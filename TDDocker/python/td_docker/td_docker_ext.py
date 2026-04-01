"""TDDockerExt — Orchestrator extension for the TDDocker COMP.

Manages docker-compose lifecycle, watchdog, and per-service container COMPs.
Supports multiple Docker projects simultaneously, each with its own session.
Loaded as an extension on the TDDocker base COMP.

Uses ``threading.Thread`` + a deferred-callback queue for non-blocking
subprocess execution — ``docker compose ps``, ``up``, ``down`` all run
in a daemon worker thread so the main TD cook loop stays at 60 fps.

Requires custom parameters on ownerComp (see setup_parameters()).
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

# TD modules are available at runtime inside TouchDesigner
if TYPE_CHECKING:
    pass

# Imports from our package — these files live alongside this script
# and are added to sys.path by the COMP's module loading
from td_docker.compose import (
    ComposeResult,
    OverlayConfig,
    ServiceOverlay,
    compose_down,
    compose_logs,
    compose_ps,
    compose_up,
    write_overlay,
)
from td_docker.docker_status import check_docker, start_docker_desktop
from td_docker.validator import validate_compose
from td_docker.watchdog import cleanup_orphans, send_shutdown_signal, spawn_watchdog


def _add_menu(page, name: str, label: str, names: list, labels: list, default: str = ""):
    """Create a string menu parameter (TD 2025 compatible)."""
    par = page.appendStrMenu(name, label=label)[0]
    par.menuNames = names
    par.menuLabels = labels
    if default:
        par.val = default
    return par


@dataclass
class ProjectState:
    """State for a single loaded Docker project."""

    name: str
    compose_path: Path
    compose_dir: Path
    session_id: str
    overlay_path: Path | None = None
    watchdog_pid: int | None = None
    service_configs: dict[str, ServiceOverlay] = field(default_factory=dict)
    status: str = "loaded"  # loaded | running | stopped


_STATE_COLORS: dict[str, dict[str, tuple[float, float, float]]] = {
    "running": {"comp": (0.2, 0.6, 0.2), "bg": (0.05, 0.15, 0.05), "fg": (0.3, 0.9, 0.3)},
    "created": {"comp": (0.4, 0.4, 0.4), "bg": (0.15, 0.15, 0.15), "fg": (0.6, 0.6, 0.6)},
    "paused": {"comp": (0.7, 0.6, 0.1), "bg": (0.15, 0.12, 0.02), "fg": (0.9, 0.8, 0.2)},
    "exited": {"comp": (0.7, 0.2, 0.2), "bg": (0.15, 0.05, 0.05), "fg": (0.9, 0.3, 0.3)},
    "dead": {"comp": (0.7, 0.2, 0.2), "bg": (0.15, 0.05, 0.05), "fg": (0.9, 0.3, 0.3)},
}

# RGB (0-255) for Text COMP inline formatting codes
_FMT_COLORS: dict[str, str] = {
    "running": "100,220,100",
    "healthy": "100,220,100",
    "created": "160,160,160",
    "loaded": "160,160,160",
    "paused": "220,200,50",
    "starting": "220,200,50",
    "exited": "220,80,80",
    "dead": "220,80,80",
    "error": "220,80,80",
    "unhealthy": "220,140,50",
    "online": "100,220,100",
    "offline": "220,80,80",
}


def _fc(state: str, text: str) -> str:
    """Wrap *text* in Text COMP color formatting for *state*."""
    rgb = _FMT_COLORS.get(state, "160,160,160")
    return "{" + f"#color({rgb})" + "}" + text + "{#reset()}"


class TDDockerExt:
    """Extension class for the TDDocker orchestrator COMP.

    Supports multiple Docker projects, each with its own session ID,
    overlay file, watchdog, and set of container COMPs grouped under
    ``/TDDocker/containers/{project_name}/``.
    """

    _TRANSPORT_PARAMS = (
        "Oscenable",
        "Oscinport",
        "Oscoutport",
        "Wsenable",
        "Wsport",
        "Ndienable",
        "Ndisource",
    )

    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self._projects: dict[str, ProjectState] = {}
        self._transport_cache: dict[str, dict[str, dict]] = {}
        self._polling_active: bool = False
        self._poll_in_flight: bool = False
        self._poll_result: dict[str, list[dict]] | None = None

        # Deferred callback queue for main-thread execution
        self._deferred_callbacks: list = []

        # Start the poll_script loop (handles deferred callback flush
        # even before any project is loaded/started)
        self._ensure_poll_script()
        ps = ownerComp.op("poll_script")
        if ps and hasattr(ps, "module") and hasattr(ps.module, "tick"):
            ps.module.tick()

        # Ensure multi-project parameters and table exist
        self._setup_multi_project()

        # Migrate existing container COMPs (old params → new toggles)
        self._migrate_container_comps()

        # Restore projects from surviving table DAT (after .toe reload)
        self._restore_projects()

        # Orphan cleanup on init
        if hasattr(ownerComp.par, "Orphancleanup") and ownerComp.par.Orphancleanup:
            self._cleanup_orphans()

    # ------------------------------------------------------------------
    # Multi-project setup
    # ------------------------------------------------------------------

    def _find_page(self, name: str):
        """Return the custom page with *name*, or ``None``."""
        for page in self.ownerComp.customPages:
            if page.name == name:
                return page
        return None

    def _setup_multi_project(self) -> None:
        """Create the projects table DAT and new parameters if missing."""
        self._ensure_projects_table()
        self._ensure_active_project_menu()
        self._ensure_action_pulses()
        self._ensure_library_page()
        self._ensure_status_display()
        self._ensure_poll_script()
        self._scan_library()
        self._update_orchestrator_display()

    def _ensure_projects_table(self) -> None:
        """Create the ``projects`` tableDAT if it doesn't exist."""
        if self.ownerComp.op("projects"):
            return
        projects_dat = self.ownerComp.create("tableDAT", "projects")
        projects_dat.appendRow(["project_name", "compose_path", "session_id", "status"])
        projects_dat.nodeX = 400
        projects_dat.nodeY = 0
        projects_dat.viewer = True

    def _ensure_active_project_menu(self) -> None:
        """Add the ``Activeproject`` menu parameter to the Config page."""
        if hasattr(self.ownerComp.par, "Activeproject"):
            return
        config_page = self._find_page("Config")
        if config_page:
            _add_menu(config_page, "Activeproject", "Active Project", [], [], "")

    def _ensure_action_pulses(self) -> None:
        """Add ``Removeproject``, ``Upall``, ``Downall`` pulses to the Actions page."""
        par = self.ownerComp.par
        pulses = [
            ("Removeproject", "Remove Project"),
            ("Upall", "Up All"),
            ("Downall", "Down All"),
        ]
        missing = [(n, lb) for n, lb in pulses if not hasattr(par, n)]
        if not missing:
            return
        actions_page = self._find_page("Actions")
        if actions_page:
            for name, label in missing:
                actions_page.appendPulse(name, label=label)

    def _ensure_library_page(self) -> None:
        """Set up the Library page with folder, project menu, and pulses."""
        par = self.ownerComp.par
        lib_page = self._find_page("Library")
        if not lib_page:
            lib_page = self.ownerComp.appendCustomPage("Library")
        if not hasattr(par, "Library"):
            lib_page.appendFolder("Library", label="Library Folder")
        if not hasattr(par, "Libraryproject"):
            _add_menu(lib_page, "Libraryproject", "Project", [], [], "")
        if not hasattr(par, "Scanlibrary"):
            lib_page.appendPulse("Scanlibrary", label="Scan Library")
        if not hasattr(par, "Loadfromlibrary"):
            lib_page.appendPulse("Loadfromlibrary", label="Load from Library")

    def _ensure_status_display(self) -> None:
        """Create or replace the orchestrator ``status_display`` textCOMP."""
        sd = self.ownerComp.op("status_display")
        if sd and sd.OPType != "textCOMP":
            sd.destroy()
            sd = None
        if not sd:
            sd = self.ownerComp.create("textCOMP", "status_display")
            sd.par.w = 480
            sd.par.h = 300
            sd.par.fontsize = 16
            sd.par.font = "Verdana"
            sd.par.formatcodes = True
            sd.par.bgalpha = 1
            sd.nodeX = 0
            sd.nodeY = 100
            sd.viewer = True
        self.ownerComp.par.opviewer = sd

    def _migrate_container_comps(self) -> None:
        """Migrate existing container COMPs from old params to new toggles.

        Runs on every init so that COMPs saved with the old Transport
        page (Datatransport/Videotransport menus) get upgraded in-place.
        Also assigns default ports to COMPs that have zero ports.
        """
        containers_comp = self.ownerComp.op("containers")
        if not containers_comp:
            return
        for i, comp in enumerate(containers_comp.children):
            if hasattr(comp.par, "Datatransport") and not hasattr(comp.par, "Oscenable"):
                project_name = (
                    comp.par.Projectname.eval() if hasattr(comp.par, "Projectname") else ""
                )
                svc_name = comp.par.Servicename.eval() if hasattr(comp.par, "Servicename") else ""
                self._init_container_comp(comp, project_name, svc_name, {}, i)
            elif hasattr(comp.par, "Oscenable"):
                # Assign default ports if still at zero
                self._assign_default_ports(comp, i)
                self._sync_transport_enables(comp)
                self._layout_container_ops(comp)

    def _restore_projects(self) -> None:
        """Reconstruct _projects from the surviving projects table DAT.

        After a .toe save/reload, the projects table DAT and container COMPs
        survive but _projects dict is empty.  This reads the table and rebuilds
        the dict so the extension knows about previously loaded projects.
        Transport parameter values on the COMPs are already preserved by TD.
        """
        dat = self.ownerComp.op("projects")
        if not dat or dat.numRows <= 1:  # header only or missing
            return

        import yaml

        containers_comp = self.ownerComp.op("containers")

        for row_idx in range(1, dat.numRows):
            project_name = str(dat[row_idx, 0])
            compose_str = str(dat[row_idx, 1])
            session_id = str(dat[row_idx, 2])

            if project_name in self._projects:
                continue

            compose_path = Path(compose_str)
            if not compose_path.exists():
                self._log(f"Restore skipped '{project_name}': {compose_str} not found")
                continue

            # Parse services from compose file
            try:
                content = compose_path.read_text(encoding="utf-8")
                doc = yaml.safe_load(content)
                services = doc.get("services", {})
            except Exception as e:
                self._log(f"Restore skipped '{project_name}': {e}")
                continue

            # Migrate and read state from surviving COMPs
            svc_list = list(services.items())
            multi = len(svc_list) > 1
            service_configs: dict[str, ServiceOverlay] = {}
            for svc_name, svc_cfg in svc_list:
                comp_name = self._sanitize_name(
                    f"{project_name}_{svc_name}" if multi else project_name
                )
                ndi_enabled = False
                if containers_comp:
                    comp = containers_comp.op(comp_name)
                    if comp:
                        # Re-run init to migrate old params → new toggles
                        self._init_container_comp(
                            comp,
                            project_name,
                            svc_name,
                            svc_cfg,
                        )
                        if hasattr(comp.par, "Ndienable"):
                            ndi_enabled = bool(comp.par.Ndienable.eval())
                service_configs[svc_name] = ServiceOverlay(
                    ndi_enabled=ndi_enabled,
                )

            # Check for surviving overlay file
            overlay_path = compose_path.parent / "td-overlay.yml"

            project = ProjectState(
                name=project_name,
                compose_path=compose_path,
                compose_dir=compose_path.parent,
                session_id=session_id,
                overlay_path=overlay_path if overlay_path.exists() else None,
                service_configs=service_configs,
                status="loaded",  # PollStatus will correct if running
            )
            self._projects[project_name] = project
            self._log(f"Restored project '{project_name}' from saved state")

        if self._projects:
            self._update_active_menu()
            # Defer transport operator restoration by one frame —
            # container extensions aren't wired yet during __init__.
            self._ensure_transports_deferred()

    def _ensure_transports_deferred(self) -> None:
        """Schedule ensureTransports() on all container COMPs next frame.

        Uses the deferred-callback queue so container extensions are fully
        wired before we touch them (they aren't ready during __init__).
        """
        containers_comp = self.ownerComp.op("containers")
        if not containers_comp:
            return
        paths = [
            c.path
            for c in containers_comp.children
            if hasattr(c, "par") and hasattr(c.par, "Oscenable")
        ]
        if not paths:
            return

        def _do_ensure():
            for p in paths:
                c = self.ownerComp.op(p)
                if not c:
                    continue
                ext = getattr(getattr(c, "ext", None), "TDContainerExt", None)
                if ext:
                    ext.ensureTransports()

        self._run_on_main(_do_ensure)

    def _update_projects_table(self) -> None:
        """Sync the projects table DAT with _projects dict."""
        dat = self.ownerComp.op("projects")
        if not dat:
            return
        dat.clear()
        dat.appendRow(["project_name", "compose_path", "session_id", "status"])
        for proj in self._projects.values():
            dat.appendRow(
                [
                    proj.name,
                    str(proj.compose_path),
                    proj.session_id,
                    proj.status,
                ]
            )

    def _update_active_menu(self) -> None:
        """Update the Activeproject menu with current project names."""
        if not hasattr(self.ownerComp.par, "Activeproject"):
            return
        names = list(self._projects.keys())
        labels = names[:]
        self.ownerComp.par.Activeproject.menuNames = names
        self.ownerComp.par.Activeproject.menuLabels = labels

    @property
    def _active_project(self) -> ProjectState | None:
        """Get the currently selected project, or None."""
        if not hasattr(self.ownerComp.par, "Activeproject"):
            return None
        name = self.ownerComp.par.Activeproject.eval()
        return self._projects.get(name)

    # ------------------------------------------------------------------
    # Background task helpers
    # ------------------------------------------------------------------

    def _enqueue_task(self, target, success_hook, except_hook=None, args=()):
        """Run *target* in a daemon thread; schedule hooks on the main thread.

        Uses ``threading.Thread`` + TD ``run()`` so the subprocess call
        never blocks the main cook loop.  TD's built-in ThreadManager was
        measured to block the main thread for the full duration of the
        worker (~300 ms per ``docker compose ps``), so we use raw
        ``threading.Thread`` + a deferred-callback queue instead.
        """

        # Test-only: when _sync_mode is True, run inline instead of
        # spawning a thread.  This exists solely for unit tests that
        # need deterministic execution order.  Never set in production.
        if getattr(self, "_sync_mode", False):
            try:
                target(*args)
                if success_hook:
                    success_hook()
            except Exception as e:
                if except_hook:
                    except_hook(type(e), e, e.__traceback__)
                else:
                    self._log(f"ERROR: {e}")
            return

        def _thread_body():
            try:
                target(*args)
                # Schedule success_hook on main thread next frame
                if success_hook:
                    # run() is a TD global available at module level in
                    # the textDAT, but not in a package import.  Access
                    # it via the ownerComp's parent.
                    self._run_on_main(success_hook)
            except Exception as e:
                if except_hook:
                    self._run_on_main(except_hook, type(e), e, e.__traceback__)
                else:
                    self._log(f"ERROR: {e}")

        t = threading.Thread(target=_thread_body, daemon=True)
        t.start()

    def _run_on_main(self, fn, *args):
        """Schedule *fn(*args)* on TD's main thread via a deferred call.

        Thread-safe: only touches a plain Python list, never TD objects.
        The poll_script's ``tick()`` loop calls ``_flush_deferred()``
        every frame.  The loop auto-starts when the poll_script DAT is
        created by ``_ensure_poll_script()``.
        """
        self._deferred_callbacks.append((fn, args))

    def _flush_deferred(self):
        """Execute all pending deferred callbacks on the main thread."""
        while self._deferred_callbacks:
            fn, args = self._deferred_callbacks.pop(0)
            try:
                fn(*args)
            except Exception as e:
                self._log(f"ERROR in deferred callback: {e}")

    # ------------------------------------------------------------------
    # Parameter callbacks (pulse buttons)
    # ------------------------------------------------------------------

    def onParValueChange(self, par, prev):
        """Called by TD when any custom parameter changes."""

    def onParPulse(self, par):
        """Called by TD when a pulse parameter is pressed."""
        name = par.name
        if name == "Load":
            self._load()
        elif name == "Up":
            self._up()
        elif name == "Down":
            self._down()
        elif name == "Rebuild":
            self._rebuild()
        elif name == "Viewlogs":
            self._view_logs()
        elif name == "Startdocker":
            self._start_docker()
        elif name == "Checkdocker":
            self._check_docker()
        elif name == "Removeproject":
            self._remove_project()
        elif name == "Upall":
            self._up_all()
        elif name == "Downall":
            self._down_all()
        elif name == "Scanlibrary":
            self._scan_library()
        elif name == "Loadfromlibrary":
            self._load_from_library()

    # ------------------------------------------------------------------
    # Docker status
    # ------------------------------------------------------------------

    _docker_ok: bool = False
    _docker_check_time: float = 0.0

    def _require_docker(self, on_ready=None) -> bool:
        """Check Docker is running (cached 30 s), then call *on_ready*.

        Args:
            on_ready: Optional callback invoked on the main thread once
                Docker is confirmed available.  When provided, the check
                runs async and *on_ready* is called only if Docker is up.
                When ``None``, behaves as a simple bool guard using the
                cached value.

        Returns:
            ``True`` immediately when the cache confirms Docker is up.
            ``False`` when the cache says Docker is down and no async
            check is needed.  When a fresh async check is launched the
            return value is ``True`` only if *on_ready* is ``None``
            (legacy optimistic path); with *on_ready* the caller should
            **not** proceed — *on_ready* will be called instead.
        """
        now = time.monotonic()
        if self._docker_ok and (now - self._docker_check_time) < 30:
            if on_ready:
                on_ready()
            return True

        # Run check in background thread to avoid blocking the cook loop
        result_holder: list = [None]

        def _worker():
            result_holder[0] = check_docker()

        def _done():
            status = result_holder[0]
            if status and status.available:
                self._docker_ok = True
                self._docker_check_time = time.monotonic()
                if on_ready:
                    on_ready()
            elif status:
                self._docker_ok = False
                self._log(f"ERROR: {status.message}")
                self._update_orchestrator_display()
                self._show_docker_popup(status)

        self._enqueue_task(target=_worker, success_hook=_done)
        # With on_ready: caller must NOT proceed — on_ready fires later.
        # Without on_ready: legacy optimistic return.
        return not on_ready

    def _check_docker(self) -> None:
        """Manual Docker status check (pulse button, async)."""
        result_holder: list = [None]

        def _worker():
            result_holder[0] = check_docker()

        def _done():
            status = result_holder[0]
            if status:
                self._docker_ok = status.available
                if status.available:
                    self._docker_check_time = time.monotonic()
                self._log(status.message)
                self._update_orchestrator_display()

        self._enqueue_task(target=_worker, success_hook=_done)

    def _start_docker(self) -> None:
        """Launch Docker Desktop."""
        msg = start_docker_desktop()
        self._log(msg)

    def _show_docker_popup(self, status) -> None:
        """Show a popup dialog when Docker is unavailable."""
        try:
            pop = self.ownerComp.op("/TDResources/popDialog")
            if not pop:
                return
        except Exception:
            return

        if getattr(status, "cli_missing", False):
            pop.Open(
                text=("Docker is not installed.\n\nInstall Docker Desktop to use TDDocker."),
                title="TDDocker",
                buttons=["Download", "Cancel"],
                callback=self._on_docker_install_popup,
                escButton=2,
                enterButton=1,
                escOnClickAway=True,
            )
        else:
            pop.Open(
                text=("Docker Desktop is not running.\n\nStart Docker Desktop?"),
                title="TDDocker",
                buttons=["Start Docker", "Cancel"],
                callback=self._on_docker_start_popup,
                escButton=2,
                enterButton=1,
                escOnClickAway=True,
            )

    def _on_docker_start_popup(self, info) -> None:
        """Callback for the 'Start Docker' popup."""
        if info.get("buttonNum") == 1:
            self._start_docker()

    def _on_docker_install_popup(self, info) -> None:
        """Callback for the 'Install Docker' popup."""
        if info.get("buttonNum") == 1:
            import webbrowser

            webbrowser.open("https://www.docker.com/products/docker-desktop/")

    # ------------------------------------------------------------------
    # Core lifecycle
    # ------------------------------------------------------------------

    @staticmethod
    def _derive_project_name(compose_path: Path) -> str:
        """Derive a project name from the compose file's parent directory."""
        name = compose_path.parent.name
        if not name or name in (".", "/", "\\"):
            name = compose_path.stem
        return TDDockerExt._sanitize_name(name)

    def _load(self) -> None:
        """Parse and validate the compose file, add as a new project."""
        compose_path = self._get_compose_path()
        if not compose_path:
            return

        project_name = self._derive_project_name(compose_path)

        # Check if project already loaded
        if project_name in self._projects:
            self._log(
                f"Project '{project_name}' already loaded — use Rebuild to reload or Remove first"
            )
            return

        self._log(f"Loading project '{project_name}': {compose_path}")

        # Read and validate
        try:
            content = compose_path.read_text(encoding="utf-8")
        except OSError as e:
            self._log(f"ERROR: Cannot read file: {e}")
            return

        result = validate_compose(content)
        for issue in result.warnings:
            self._log(f"WARNING [{issue.service}]: {issue.message}")
        if result.has_errors:
            for issue in result.errors:
                self._log(f"ERROR [{issue.service}]: {issue.message}")
            self._log("Compose file has security errors — aborting load")
            return

        # Parse services
        import yaml

        doc = yaml.safe_load(content)
        services = doc.get("services", {})

        # Create project state with service configs
        session_id = uuid.uuid4().hex[:12]
        service_configs = {svc_name: ServiceOverlay(ndi_enabled=False) for svc_name in services}
        project = ProjectState(
            name=project_name,
            compose_path=compose_path,
            compose_dir=compose_path.parent,
            session_id=session_id,
            service_configs=service_configs,
        )
        self._projects[project_name] = project

        # Create container COMPs directly under /containers
        # Single service → COMP named after project
        # Multi service → COMPs named {project}_{service}
        containers_comp = self._get_containers_comp()
        svc_list = list(services.items())
        multi = len(svc_list) > 1

        # Offset new COMPs after existing ones
        existing_count = len(containers_comp.children)

        for i, (svc_name, svc_cfg) in enumerate(svc_list):
            if multi:
                comp_name = self._sanitize_name(f"{project_name}_{svc_name}")
            else:
                comp_name = self._sanitize_name(project_name)
            # Skip if COMP already exists (e.g. after extension reinit)
            if containers_comp.op(comp_name):
                continue
            self._create_container_comp(
                containers_comp,
                comp_name,
                project_name,
                svc_name,
                svc_cfg,
                existing_count + i,
            )

        # Generate overlay
        config = OverlayConfig(
            session_id=session_id,
            service_overrides=project.service_configs,
        )
        try:
            project.overlay_path = write_overlay(
                compose_path,
                config,
                output_dir=project.compose_dir,
            )
            self._log(f"Overlay written: {project.overlay_path}")
        except ValueError as e:
            self._log(f"ERROR generating overlay: {e}")
            del self._projects[project_name]
            self._destroy_project_comps(project_name)
            return

        # Update UI
        self._update_projects_table()
        self._update_active_menu()

        # Set as active project
        if hasattr(self.ownerComp.par, "Activeproject"):
            self.ownerComp.par.Activeproject = project_name

        # Update status table
        self._rebuild_status_table()
        self._log(f"Loaded {len(services)} service(s) in project '{project_name}'")

    def _up(self) -> None:
        """Start containers for the active project."""
        project = self._active_project
        if not project:
            self._log("ERROR: No active project — Load a compose file first")
            return
        self._up_project(project)

    def _up_project(self, project: ProjectState) -> None:
        """Start containers for a specific project (async).

        Checks Docker availability first; the actual ``compose up`` only
        runs once Docker is confirmed reachable.
        """
        if not project.overlay_path:
            self._log(f"ERROR: Project '{project.name}' has no overlay — reload it")
            return

        def _do_up():
            self._log(f"Starting project '{project.name}'...")

            result_holder: list[ComposeResult | None] = [None]

            def _target(compose_path, overlay_path, session_id):
                result_holder[0] = compose_up(compose_path, overlay_path, session_id)

            def _on_success():
                result = result_holder[0]
                if result and result.ok:
                    project.status = "running"
                    self._log(f"Project '{project.name}' started")

                    # Spawn watchdog
                    if (
                        hasattr(self.ownerComp.par, "Autoshutdown")
                        and self.ownerComp.par.Autoshutdown
                    ):
                        self._spawn_watchdog(project)

                    # Start polling (shared across all projects)
                    self._start_polling()
                    self._refresh_project_status(project)
                    self._update_projects_table()
                elif result:
                    self._log(f"ERROR: compose up failed for '{project.name}':\n{result.stderr}")

            def _on_except(*args):
                self._log(f"ERROR: compose up exception for '{project.name}': {args}")

            self._enqueue_task(
                target=_target,
                success_hook=_on_success,
                except_hook=_on_except,
                args=(
                    project.compose_path,
                    project.overlay_path,
                    project.session_id,
                ),
            )

        self._require_docker(on_ready=_do_up)

    def _down(self) -> None:
        """Stop containers for the active project."""
        project = self._active_project
        if not project:
            self._log("ERROR: No active project")
            return
        self._down_project(project)

    def _down_project(self, project: ProjectState, on_complete=None) -> None:
        """Stop containers for a specific project (async).

        Args:
            project: The project to stop.
            on_complete: Optional callback executed on the main thread after
                the down operation finishes (success or failure).  Used by
                ``_remove_project`` and ``_rebuild`` to chain cleanup safely.
        """
        self._log(f"Stopping project '{project.name}'...")

        # Signal watchdog for clean shutdown
        if project.compose_dir:
            send_shutdown_signal(project.compose_dir)

        result_holder: list[ComposeResult | None] = [None]

        def _target(session_id):
            result_holder[0] = compose_down(session_id)

        def _on_success():
            result = result_holder[0]
            if result and result.ok:
                project.status = "stopped"
                self._log(f"Project '{project.name}' stopped")
            elif result:
                self._log(f"WARNING: compose down issues for '{project.name}':\n{result.stderr}")

            project.watchdog_pid = None
            self._update_projects_table()

            # Stop polling if no projects are running
            if not any(p.status == "running" for p in self._projects.values()):
                self._stop_polling()

            # Refresh displays to show exited state
            self._refresh_project_status(project)

            if on_complete:
                on_complete()

        def _on_except(*args):
            self._log(f"ERROR: compose down exception for '{project.name}': {args}")
            if on_complete:
                on_complete()

        self._enqueue_task(
            target=_target,
            success_hook=_on_success,
            except_hook=_on_except,
            args=(project.session_id,),
        )

    def _up_all(self) -> None:
        """Start all loaded projects that are not already running."""
        for project in self._projects.values():
            if project.status != "running":
                self._up_project(project)

    def _down_all(self) -> None:
        """Stop all running projects."""
        for project in list(self._projects.values()):
            if project.status == "running":
                self._down_project(project)

    def _remove_project(self) -> None:
        """Remove the active project (stops it first if running).

        If the project is running, cleanup is deferred until the async
        down operation completes via ``on_complete``.
        """
        project = self._active_project
        if not project:
            self._log("ERROR: No active project to remove")
            return

        name = project.name

        def _after_down():
            self._cache_transport(name)
            self._destroy_project_comps(name)
            if name in self._projects:
                del self._projects[name]
            self._update_projects_table()
            self._update_active_menu()
            self._log(f"Removed project '{name}'")
            self._update_orchestrator_display()

        if project.status == "running":
            self._down_project(project, on_complete=_after_down)
        else:
            _after_down()

    def _rebuild(self) -> None:
        """Rebuild the active project: Down + destroy + re-Load + Up.

        If the project is running, the destroy/reload/up sequence is
        deferred until the async down completes via ``on_complete``.
        """
        project = self._active_project
        if not project:
            self._log("ERROR: No active project to rebuild")
            return

        compose_path = project.compose_path
        name = project.name

        def _after_down():
            self._cache_transport(name)
            self._destroy_project_comps(name)
            if name in self._projects:
                del self._projects[name]
            if hasattr(self.ownerComp.par, "Composefile"):
                self.ownerComp.par.Composefile = str(compose_path)
            self._load()
            self._up()

        if project.status == "running":
            self._down_project(project, on_complete=_after_down)
        else:
            _after_down()

    def _view_logs(self) -> None:
        """Fetch compose logs for the active project into the log DAT (async)."""
        project = self._active_project
        if not project:
            return

        result_holder: list = [None]

        def _worker():
            result_holder[0] = compose_logs(project.session_id, tail=200)

        def _on_success():
            result = result_holder[0]
            log_dat = self.ownerComp.op("log")
            if log_dat and result:
                log_dat.text = result.stdout if result.ok else result.stderr

        self._enqueue_task(target=_worker, success_hook=_on_success)

    # ------------------------------------------------------------------
    # NDI overlay regeneration
    # ------------------------------------------------------------------

    def NotifyNdiChanged(self, project_name: str, svc_name: str, enabled: bool) -> None:
        """Called by container ext when NDI transport is toggled.

        Args:
            project_name: Name of the project the service belongs to.
            svc_name: Name of the service toggling NDI.
            enabled: Whether NDI is being enabled or disabled.
        """
        project = self._projects.get(project_name)
        if not project:
            return
        if svc_name in project.service_configs:
            project.service_configs[svc_name].ndi_enabled = enabled
            self._regenerate_overlay(project)

    def _regenerate_overlay(self, project: ProjectState) -> None:
        """Re-generate overlay for a project and apply changes."""
        if not project.overlay_path:
            return
        config = OverlayConfig(
            session_id=project.session_id,
            service_overrides=project.service_configs,
        )
        try:
            project.overlay_path = write_overlay(
                project.compose_path,
                config,
                output_dir=project.compose_dir,
            )
        except ValueError as e:
            self._log(f"ERROR regenerating overlay for '{project.name}': {e}")
            return
        result_holder: list[ComposeResult | None] = [None]

        def _worker():
            if project.overlay_path is None:
                return
            result_holder[0] = compose_up(
                project.compose_path, project.overlay_path, project.session_id
            )

        def _on_success():
            result = result_holder[0]
            if result and result.ok:
                self._log(f"Overlay regenerated for '{project.name}'")
            elif result:
                self._log(f"WARNING: overlay reapply failed for '{project.name}': {result.stderr}")

        self._enqueue_task(target=_worker, success_hook=_on_success)

    # ------------------------------------------------------------------
    # Watchdog
    # ------------------------------------------------------------------

    def _spawn_watchdog(self, project: ProjectState) -> None:
        td_pid = os.getpid()
        project.watchdog_pid = spawn_watchdog(
            td_pid,
            project.session_id,
            project.compose_dir,
        )
        self._log(f"Watchdog spawned for '{project.name}' (PID {project.watchdog_pid})")

    def _cleanup_orphans(self) -> None:
        removed = cleanup_orphans()
        if removed:
            self._log(f"Cleaned up {len(removed)} orphan container(s)")

    # ------------------------------------------------------------------
    # Container COMP management
    # ------------------------------------------------------------------

    def _get_containers_comp(self):
        """Get or create the /containers base COMP."""
        comp = self.ownerComp.op("containers")
        if comp is None:
            comp = self.ownerComp.create("baseCOMP", "containers")
        return comp

    @staticmethod
    def _sanitize_name(name: str) -> str:
        """Make a service name safe for TD operator naming."""
        return name.replace("-", "_").replace(".", "_").replace(" ", "_")

    def _create_container_comp(
        self,
        parent_comp,
        comp_name: str,
        project_name: str,
        svc_name: str,
        svc_cfg: dict,
        index: int = 0,
    ) -> None:
        """Create a container COMP for a service using the template."""
        # Try to load from template TOX, fall back to creating a base COMP
        template_path = (
            self.ownerComp.par.Containertemplate.eval()
            if hasattr(self.ownerComp.par, "Containertemplate")
            else ""
        )

        if template_path and Path(template_path).exists():
            comp = parent_comp.loadTox(template_path)
            comp.name = comp_name
        else:
            comp = parent_comp.create("baseCOMP", comp_name)

        # Position container COMPs side by side
        comp.nodeX = index * 250
        comp.nodeY = 0
        comp.viewer = True

        # Set up the extension if not from template
        self._init_container_comp(comp, project_name, svc_name, svc_cfg, index)

    def _init_container_comp(
        self,
        comp,
        project_name: str,
        svc_name: str,
        svc_cfg: dict,
        index: int = 0,
    ) -> None:
        """Initialize custom parameters on a container COMP."""
        image = svc_cfg.get("image", "")

        # Create custom parameter pages if they don't exist
        if not comp.customPages:
            info_page = comp.appendCustomPage("Info")
            info_page.appendStr("Projectname", label="Project Name")[0].val = project_name
            info_page.appendStr("Servicename", label="Service Name")[0].val = svc_name
            info_page.appendStr("Image", label="Image")[0].val = image
            info_page.appendStr("Containerid", label="Container ID")[0].val = ""
            ports_str = ", ".join(str(p) for p in svc_cfg.get("ports", []))
            p = info_page.appendStr("Ports", label="Ports")[0]
            p.val = ports_str
            p.readOnly = True
            _add_menu(
                info_page,
                "State",
                "State",
                ["created", "running", "paused", "exited", "dead"],
                ["Created", "Running", "Paused", "Exited", "Dead"],
                "created",
            )
            _add_menu(
                info_page,
                "Health",
                "Health",
                ["none", "healthy", "unhealthy"],
                ["None", "Healthy", "Unhealthy"],
                "none",
            )

            actions_page = comp.appendCustomPage("Actions")
            actions_page.appendPulse("Start", label="Start")
            actions_page.appendPulse("Stop", label="Stop")
            actions_page.appendPulse("Restart", label="Restart")
            actions_page.appendPulse("Logs", label="Logs")

            transport_page = comp.appendCustomPage("Transport")
            # OSC — unique ports per container (base 9000)
            transport_page.appendToggle("Oscenable", label="OSC")[0].val = False
            transport_page.appendInt("Oscinport", label="OSC In Port")[0].val = 9000 + index * 2
            transport_page.appendInt("Oscoutport", label="OSC Out Port")[0].val = 9001 + index * 2
            # WebSocket — unique port per container (base 8080)
            transport_page.appendToggle("Wsenable", label="WebSocket")[0].val = False
            transport_page.appendInt("Wsport", label="WS Port")[0].val = 8080 + index
            # NDI
            transport_page.appendToggle("Ndienable", label="NDI")[0].val = False
            transport_page.appendStr("Ndisource", label="NDI Source")[0].val = ""
            # Restore cached transport config (from previous Remove)
            self._restore_transport_cache(comp, project_name, svc_name)
            # Grey out sub-params based on toggle state
            self._sync_transport_enables(comp)
        else:
            # Template loaded — just update values
            if hasattr(comp.par, "Projectname"):
                comp.par.Projectname = project_name
            if hasattr(comp.par, "Servicename"):
                comp.par.Servicename = svc_name
            if hasattr(comp.par, "Image"):
                comp.par.Image = image
            # Update ports from YAML
            if hasattr(comp.par, "Ports"):
                comp.par.Ports = ", ".join(str(p) for p in svc_cfg.get("ports", []))

        # Migrate old Transport page (Datatransport/Videotransport) to toggles
        if hasattr(comp.par, "Datatransport") and not hasattr(comp.par, "Oscenable"):
            # Remove old Transport page
            for page in comp.customPages:
                if page.name == "Transport":
                    page.destroy()
                    break
            # Recreate with new toggle layout
            transport_page = comp.appendCustomPage("Transport")
            transport_page.appendToggle("Oscenable", label="OSC")[0].val = False
            transport_page.appendInt("Oscinport", label="OSC In Port")[0].val = 9000 + index * 2
            transport_page.appendInt("Oscoutport", label="OSC Out Port")[0].val = 9001 + index * 2
            transport_page.appendToggle("Wsenable", label="WebSocket")[0].val = False
            transport_page.appendInt("Wsport", label="WS Port")[0].val = 8080 + index
            transport_page.appendToggle("Ndienable", label="NDI")[0].val = False
            transport_page.appendStr("Ndisource", label="NDI Source")[0].val = ""
            self._sync_transport_enables(comp)
            # Clean up old/stale transport operators
            for op_name in (
                "data_in",
                "osc_data",
                "ws_data",
                "osc_callbacks",
                "ws_callbacks",
                "osc_in_callbacks",
                "websocket_dat_callbacks",
            ):
                old_op = comp.op(op_name)
                if old_op:
                    old_op.destroy()

        # Create internal operators if not from template
        if not comp.op("log_dat"):
            comp.create("textDAT", "log_dat")

        # Wire container extension
        if not comp.op("td_container_ext"):
            ext_dat = comp.create("textDAT", "td_container_ext")
            ext_dat.text = (
                "import sys, os\n"
                "_py = os.path.join(project.folder, 'python')\n"
                "if _py not in sys.path:\n"
                "    sys.path.insert(0, _py)\n"
                "from td_docker.td_container_ext import TDContainerExt\n"
            )
            ext_dat.viewer = True
        comp.par.ext = 1
        comp.par.ext0object = f"op('{comp.path}/td_container_ext').module.TDContainerExt(me)"
        comp.par.ext0promote = True

        # Parameter execute DAT — routes pulse/value callbacks to extension
        _pars_str = "Start Stop Restart Logs Oscenable Wsenable Ndienable Ndisource"
        pe = comp.op("parexec1")
        if not pe:
            pe = comp.create("parameterexecuteDAT", "parexec1")
            pe.par.op = comp.path
            pe.par.onpulse = True
            pe.par.valuechange = True
            pe.par.custom = True
            pe.par.builtin = False
            pe.text = (
                "def onValueChange(par, prev):\n"
                "\text = par.owner.ext.TDContainerExt\n"
                "\tif ext and hasattr(ext, 'onParValueChange'):\n"
                "\t\text.onParValueChange(par, prev)\n"
                "\n"
                "def onPulse(par):\n"
                "\text = par.owner.ext.TDContainerExt\n"
                "\tif ext and hasattr(ext, 'onParPulse'):\n"
                "\t\text.onParPulse(par)\n"
            )
        # Always update monitored params (handles migration)
        pe.par.pars = _pars_str

        # Create status display TOP for visual feedback
        if not comp.op("status_display"):
            txt = comp.create("textTOP", "status_display")
            txt.par.resolutionw = 320
            txt.par.resolutionh = 200
            txt.par.fontsizex = 18
            txt.par.alignx = 1  # center
            txt.par.aligny = 1  # center
            txt.par.bgalpha = 1
            txt.viewer = True
        comp.par.opviewer = comp.op("status_display")

        # Layout internal operators
        self._layout_container_ops(comp)

        self._update_container_display(comp, "created", "none")

    @staticmethod
    def _assign_default_ports(comp, index: int) -> None:
        """Set default unique ports on a container COMP if still at zero."""
        defaults = {
            "Oscinport": 9000 + index * 2,
            "Oscoutport": 9001 + index * 2,
            "Wsport": 8080 + index,
        }
        for par_name, default_val in defaults.items():
            if hasattr(comp.par, par_name) and int(comp.par[par_name].eval()) == 0:
                comp.par[par_name].val = default_val

    @staticmethod
    def _sync_transport_enables(comp) -> None:
        """Enable/disable transport sub-params based on their toggle."""
        toggles = {
            "Oscenable": ("Oscinport", "Oscoutport"),
            "Wsenable": ("Wsport",),
            "Ndienable": ("Ndisource",),
        }
        for toggle, pars in toggles.items():
            enabled = bool(hasattr(comp.par, toggle) and comp.par[toggle].eval())
            for p in pars:
                if hasattr(comp.par, p):
                    comp.par[p].enable = enabled

    @staticmethod
    def _layout_container_ops(comp) -> None:
        """Position internal operators in a tidy grid."""
        # Remove stale operators from old transport implementations
        for stale in (
            "data_in",
            "osc_data",
            "ws_data",
            "osc_callbacks",
            "ws_callbacks",
            "osc_in_callbacks",
            "websocket_dat_callbacks",
        ):
            old = comp.op(stale)
            if old:
                old.destroy()

        layout = {
            # Row 1: display + log
            "status_display": (0, 0),
            "log_dat": (200, 0),
            # Row 2: extension + parexec
            "td_container_ext": (0, -200),
            "parexec1": (200, -200),
            # Row 3: transport operators
            "osc_in": (0, -400),
            "osc_out": (200, -400),
            "websocket_dat": (400, -400),
            # Row 4: callbacks (under their operator)
            "oscin_callbacks": (0, -600),
            "websocket_callbacks": (400, -600),
            # Row 5: video transports
            "video_in": (0, -800),
            "video_out": (200, -800),
        }
        for name, (x, y) in layout.items():
            op_node = comp.op(name)
            if op_node:
                op_node.nodeX = x
                op_node.nodeY = y

    def _update_container_display(self, comp, state: str, health: str) -> None:
        """Update the visual status display on a container COMP."""
        txt = comp.op("status_display")
        if not txt:
            return
        svc_name = ""
        if hasattr(comp.par, "Servicename"):
            svc_name = comp.par.Servicename.eval()

        # Determine effective state for color lookup
        effective = state
        if state == "running" and health == "unhealthy":
            effective = "dead"  # red

        colors = _STATE_COLORS.get(effective, _STATE_COLORS["created"])

        # Yellow for "has container ID but not yet running" (starting)
        cid = ""
        if hasattr(comp.par, "Containerid"):
            cid = comp.par.Containerid.eval()
        if cid and state == "created":
            colors = _STATE_COLORS["paused"]

        # Update text
        label = "UNHEALTHY" if health == "unhealthy" else state.upper()
        txt.par.text = f"{svc_name}\n━━━━━━━━\n● {label}"

        # Update colors
        txt.par.fontcolorr, txt.par.fontcolorg, txt.par.fontcolorb = colors["fg"]
        txt.par.bgcolorr, txt.par.bgcolorg, txt.par.bgcolorb = colors["bg"]
        comp.color = colors["comp"]

    def _update_orchestrator_display(self) -> None:
        """Update the orchestrator-level status display on /TDDocker."""
        txt = self.ownerComp.op("status_display")
        if not txt:
            return

        lines = ["TDDocker", "━━━━━━━━━━━━━━"]

        # Docker status line — use cached flag, never subprocess here
        docker_state = "online" if self._docker_ok else "offline"
        docker_label = "Online" if self._docker_ok else "Offline"
        lines.append(f"Docker: {_fc(docker_state, docker_label)}")

        # Project count
        n = len(self._projects)
        lines.append(f"{n} project{'s' if n != 1 else ''}")
        lines.append("")

        # Per-project summary
        worst_state = "none"  # none < loaded < running < error
        for proj_name, project in self._projects.items():
            # Get service states from COMPs
            comps = self._get_project_comps(proj_name)
            svc_entries = []
            proj_has_error = False
            proj_all_running = True

            for comp in comps:
                svc = comp.par.Servicename.eval() if hasattr(comp.par, "Servicename") else "?"
                state = comp.par.State.eval() if hasattr(comp.par, "State") else "created"
                health = comp.par.Health.eval() if hasattr(comp.par, "Health") else "none"
                if state in ("exited", "dead") or health == "unhealthy":
                    proj_has_error = True
                if state != "running":
                    proj_all_running = False

                indicator = state.upper()
                color_key = state
                if health == "unhealthy":
                    indicator = "UNHEALTHY"
                    color_key = "unhealthy"
                elif state == "running" and health == "healthy":
                    indicator = "HEALTHY"
                    color_key = "healthy"
                svc_entries.append((svc, indicator, color_key))

            # Project status label
            if proj_has_error:
                proj_label = "ERROR"
                proj_color = "error"
                worst_state = "error"
            elif proj_all_running and comps:
                proj_label = "RUNNING"
                proj_color = "running"
                if worst_state not in ("error",):
                    worst_state = "running"
            else:
                proj_label = project.status.upper()
                proj_color = "loaded"
                if worst_state not in ("error", "running"):
                    worst_state = "loaded"

            # Tree-style layout with colors
            folder = "\U0001f4c1"
            dash = "\u2014"
            dot = "\u2022"
            lines.append(_fc(proj_color, f"{folder} {proj_name} {dash} {proj_label}"))
            for i, (svc, indicator, color_key) in enumerate(svc_entries):
                is_last = i == len(svc_entries) - 1
                svc_text = f"{svc} {dot} {indicator}"
                if is_last:
                    lines.append(f" \u2514 {_fc(color_key, svc_text)}")
                else:
                    lines.append(f" \u251c {_fc(color_key, svc_text)}")
            lines.append("")

        # Set text — use expr so \n is interpreted as newlines
        txt.par.text.expr = repr("\n".join(lines))

        # Set colors based on worst state
        color_map = {
            "none": _STATE_COLORS["created"],
            "loaded": _STATE_COLORS["paused"],
            "running": _STATE_COLORS["running"],
            "error": _STATE_COLORS["exited"],
        }
        colors = color_map.get(worst_state, _STATE_COLORS["created"])
        txt.par.fontcolorr, txt.par.fontcolorg, txt.par.fontcolorb = colors["fg"]
        txt.par.bgcolorr, txt.par.bgcolorg, txt.par.bgcolorb = colors["bg"]
        self.ownerComp.color = colors["comp"]

    def _get_project_comps(self, project_name: str) -> list:
        """Find all container COMPs belonging to a project."""
        containers_comp = self.ownerComp.op("containers")
        if not containers_comp:
            return []
        return [
            child
            for child in containers_comp.children
            if hasattr(child.par, "Projectname") and child.par.Projectname.eval() == project_name
        ]

    def _destroy_project_comps(self, project_name: str) -> None:
        """Remove all container COMPs belonging to a project."""
        for comp in self._get_project_comps(project_name):
            comp.destroy()

    def _cache_transport(self, project_name: str) -> None:
        """Save transport params from all COMPs of a project before destruction."""
        cache: dict[str, dict] = {}
        for comp in self._get_project_comps(project_name):
            svc = comp.par.Servicename.eval() if hasattr(comp.par, "Servicename") else ""
            if not svc:
                continue
            params = {}
            for p in self._TRANSPORT_PARAMS:
                if hasattr(comp.par, p):
                    params[p] = comp.par[p].eval()
            cache[svc] = params
        if cache:
            self._transport_cache[project_name] = cache

    def _restore_transport_cache(
        self,
        comp,
        project_name: str,
        svc_name: str,
    ) -> None:
        """Restore cached transport params onto a freshly created COMP."""
        cached = self._transport_cache.get(project_name, {}).get(svc_name)
        if not cached:
            return
        for p, val in cached.items():
            if hasattr(comp.par, p):
                comp.par[p].val = val
        self._sync_transport_enables(comp)

    # ------------------------------------------------------------------
    # Status polling (async via worker thread, multi-project)
    # ------------------------------------------------------------------

    _POLL_SCRIPT = (
        "import time as _time\n"
        "_last_poll = [0]\n"
        "\n"
        "def tick():\n"
        "\ttry:\n"
        "\t\ttd_docker = op('/TDDocker')\n"
        "\t\text = getattr(td_docker.ext, 'TDDockerExt', None)\n"
        "\t\tif not ext:\n"
        "\t\t\treturn\n"
        "\t\text._flush_deferred()\n"
        "\t\tnow = _time.monotonic()\n"
        "\t\tif getattr(ext, '_polling_active', False) "
        "and (now - _last_poll[0]) >= 2:\n"
        "\t\t\t_last_poll[0] = now\n"
        "\t\t\text.PollStatusAsync()\n"
        "\texcept Exception as e:\n"
        "\t\tprint(f'Poll error: {e}')\n"
        "\t\treturn\n"
        "\trun('op(\\\"/TDDocker/poll_script\\\").module.tick()',\n"
        "\t    delayFrames=1)\n"
        "\n"
        "# Auto-start: schedule first tick on module load\n"
        "run('op(\\\"/TDDocker/poll_script\\\").module.tick()',\n"
        "    delayFrames=1)\n"
    )

    def _ensure_poll_script(self) -> None:
        """Create or update the poll_script DAT.

        Only rewrites the text when the DAT is new or its content has
        changed, to avoid resetting the module and spawning duplicate
        tick loops.
        """
        ps = self.ownerComp.op("poll_script")
        created = False
        if not ps:
            ps = self.ownerComp.create("textDAT", "poll_script")
            ps.nodeX = 400
            ps.nodeY = -100
            ps.viewer = True
            created = True
        if created or ps.text.strip() != self._POLL_SCRIPT.strip():
            ps.text = self._POLL_SCRIPT

    def _start_polling(self) -> None:
        """Enable Docker status polling (every 2 s) inside the tick loop."""
        self._polling_active = True

    def _stop_polling(self) -> None:
        """Stop the polling loop."""
        self._polling_active = False

    def _poll_worker(self, project_sessions: list[tuple[str, str]]) -> None:
        """Run ``compose_ps`` in a worker thread for each active project.

        Stores the result in ``_poll_result`` — safe because
        SuccessHook runs on the main thread after the worker finishes.
        """
        results: dict[str, list[dict]] = {}
        for proj_name, session_id in project_sessions:
            statuses = compose_ps(session_id)
            results[proj_name] = [
                {
                    "service": s.service,
                    "container_id": s.container_id,
                    "state": s.state,
                    "health": s.health,
                    "image": s.image,
                }
                for s in statuses
            ]
        self._poll_result = results

    def _poll_success(self) -> None:
        """Main-thread callback after ``_poll_worker`` completes."""
        data = self._poll_result
        self._poll_result = None
        self._poll_in_flight = False

        if data is None:
            return
        self._apply_poll_result(data)

    def _poll_except(self, *args) -> None:
        """Main-thread callback if ``_poll_worker`` raises."""
        self._poll_in_flight = False
        self._log(f"Poll error: {args}")

    def PollStatusAsync(self) -> None:
        """Non-blocking poll — runs ``compose_ps`` in a worker thread.

        Polls all running projects. Skips if a poll is already in flight.
        """
        if self._poll_in_flight:
            return
        active = [
            (name, p.session_id) for name, p in self._projects.items() if p.status == "running"
        ]
        if not active:
            return
        self._poll_in_flight = True
        self._enqueue_task(
            target=self._poll_worker,
            success_hook=self._poll_success,
            except_hook=self._poll_except,
            args=(active,),
        )

    def PollStatus(self) -> None:
        """Refresh container statuses (non-blocking).

        Delegates to PollStatusAsync so callers never block the main thread.
        """
        self.PollStatusAsync()

    def _refresh_project_status(self, project: ProjectState) -> None:
        """One-shot async refresh for a single project."""
        result_holder: list = [None]

        def _worker(session_id):
            result_holder[0] = compose_ps(session_id)

        def _on_success():
            statuses = result_holder[0]
            if statuses is None:
                return
            data = [
                {
                    "service": s.service,
                    "container_id": s.container_id,
                    "state": s.state,
                    "health": s.health,
                    "image": s.image,
                }
                for s in statuses
            ]
            self._apply_project_poll(project.name, data)

        self._enqueue_task(
            target=_worker,
            success_hook=_on_success,
            args=(project.session_id,),
        )

    def _apply_poll_result(self, data: dict[str, list[dict]]) -> None:
        """Apply poll results for all projects (main thread)."""
        for proj_name, statuses in data.items():
            self._apply_project_poll(proj_name, statuses)

    def _apply_project_poll(self, project_name: str, data: list[dict]) -> None:
        """Apply parsed compose_ps results to a single project's COMPs."""
        comps = self._get_project_comps(project_name)
        if not comps:
            return

        status_map = {d["service"]: d for d in data}

        for child in comps:
            svc_name = child.par.Servicename.eval() if hasattr(child.par, "Servicename") else ""
            if svc_name in status_map:
                st = status_map[svc_name]
                if hasattr(child.par, "Containerid"):
                    child.par.Containerid = st["container_id"]
                if hasattr(child.par, "State"):
                    child.par.State = st["state"]
                health = st["health"] if st["health"] else "none"
                if hasattr(child.par, "Health"):
                    child.par.Health = health
                self._update_container_display(child, st["state"], health)
            else:
                # Service not in compose ps → exited or not started
                cid = ""
                if hasattr(child.par, "Containerid"):
                    cid = child.par.Containerid.eval()
                if cid:
                    # Had a container ID → it exited
                    if hasattr(child.par, "State"):
                        child.par.State = "exited"
                    self._update_container_display(child, "exited", "none")

        # Update the status table DAT
        self._rebuild_status_table()

    def _rebuild_status_table(self) -> None:
        """Rebuild the entire status table from all loaded projects."""
        status_dat = self.ownerComp.op("status")
        if not status_dat:
            return
        status_dat.clear()
        status_dat.appendRow(["project", "service", "state", "health", "container_id", "image"])
        for proj_name in self._projects:
            comps = self._get_project_comps(proj_name)
            for comp in comps:
                svc = comp.par.Servicename.eval() if hasattr(comp.par, "Servicename") else ""
                state = comp.par.State.eval() if hasattr(comp.par, "State") else "loaded"
                health = comp.par.Health.eval() if hasattr(comp.par, "Health") else ""
                cid = comp.par.Containerid.eval() if hasattr(comp.par, "Containerid") else ""
                img = comp.par.Image.eval() if hasattr(comp.par, "Image") else ""
                status_dat.appendRow([proj_name, svc, state, health, cid, img])

        self._update_orchestrator_display()

    # ------------------------------------------------------------------
    # Library
    # ------------------------------------------------------------------

    def _get_library_dir(self) -> Path | None:
        """Get the library directory from the Library parameter."""
        if not hasattr(self.ownerComp.par, "Library"):
            return None
        raw = self.ownerComp.par.Library.eval()
        if raw:
            p = Path(raw)
            if p.is_dir():
                return p
        # Default: library/ next to the .toe file
        try:
            default = Path(project.folder) / "library"  # type: ignore[name-defined]
            if default.is_dir():
                return default
        except NameError:
            pass  # Not running inside TouchDesigner
        return None

    def _scan_library(self) -> None:
        """Scan the library directory and update the Libraryproject menu."""
        if not hasattr(self.ownerComp.par, "Libraryproject"):
            return
        lib_dir = self._get_library_dir()
        if not lib_dir:
            self.ownerComp.par.Libraryproject.menuNames = []
            self.ownerComp.par.Libraryproject.menuLabels = []
            return

        # Find subdirectories containing a docker-compose.yml
        projects = []
        for child in sorted(lib_dir.iterdir()):
            if child.is_dir() and (child / "docker-compose.yml").exists():
                projects.append(child.name)

        self.ownerComp.par.Libraryproject.menuNames = projects
        self.ownerComp.par.Libraryproject.menuLabels = projects

        if projects:
            self._log(f"Library: found {len(projects)} project(s)")

    def _load_from_library(self) -> None:
        """Load the selected library project into TDDocker."""
        if not hasattr(self.ownerComp.par, "Libraryproject"):
            return
        selected = self.ownerComp.par.Libraryproject.eval()
        if not selected:
            self._log("ERROR: No library project selected")
            return

        lib_dir = self._get_library_dir()
        if not lib_dir:
            self._log("ERROR: Library directory not found")
            return

        project_dir = lib_dir / selected
        compose_file = project_dir / "docker-compose.yml"
        if not compose_file.exists():
            self._log(f"ERROR: {compose_file} not found")
            return

        # Point Composefile to the library project and Load
        if hasattr(self.ownerComp.par, "Composefile"):
            self.ownerComp.par.Composefile = str(compose_file)
        self._load()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_compose_path(self) -> Path | None:
        """Read the Composefile parameter and return as Path, or None."""
        if not hasattr(self.ownerComp.par, "Composefile"):
            self._log("ERROR: No Composefile parameter")
            return None
        raw = self.ownerComp.par.Composefile.eval()
        if not raw:
            self._log("ERROR: Composefile parameter is empty")
            return None
        p = Path(raw)
        if not p.exists():
            self._log(f"ERROR: File not found: {p}")
            return None
        return p

    def _log(self, msg: str) -> None:
        """Append a message to the log DAT and print to textport."""
        print(f"[TDDocker] {msg}")
        log_dat = self.ownerComp.op("log")
        if log_dat:
            log_dat.text += msg + "\n"

    # ------------------------------------------------------------------
    # TD lifecycle callbacks
    # ------------------------------------------------------------------

    def destroy(self) -> None:
        """Called when the COMP is destroyed or TD is closing."""
        if hasattr(self.ownerComp.par, "Autoshutdown") and self.ownerComp.par.Autoshutdown:
            self._down_all()
