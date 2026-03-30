"""TDDockerExt — Orchestrator extension for the TDDocker COMP.

Manages docker-compose lifecycle, watchdog, and per-service container COMPs.
Loaded as an extension on the TDDocker base COMP.

Requires custom parameters on ownerComp (see setup_parameters()).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import TYPE_CHECKING

# TD modules are available at runtime inside TouchDesigner
if TYPE_CHECKING:
    pass

# Imports from our package — these files live alongside this script
# and are added to sys.path by the COMP's module loading
from td_docker.compose import (
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


_STATE_COLORS: dict[str, dict[str, tuple[float, float, float]]] = {
    "running": {"comp": (0.2, 0.6, 0.2), "bg": (0.05, 0.15, 0.05), "fg": (0.3, 0.9, 0.3)},
    "created": {"comp": (0.4, 0.4, 0.4), "bg": (0.15, 0.15, 0.15), "fg": (0.6, 0.6, 0.6)},
    "paused":  {"comp": (0.7, 0.6, 0.1), "bg": (0.15, 0.12, 0.02), "fg": (0.9, 0.8, 0.2)},
    "exited":  {"comp": (0.7, 0.2, 0.2), "bg": (0.15, 0.05, 0.05), "fg": (0.9, 0.3, 0.3)},
    "dead":    {"comp": (0.7, 0.2, 0.2), "bg": (0.15, 0.05, 0.05), "fg": (0.9, 0.3, 0.3)},
}


class TDDockerExt:
    """Extension class for the TDDocker orchestrator COMP."""

    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self._watchdog_pid: int | None = None
        self._session_id: str = ""
        self._overlay_path: Path | None = None
        self._compose_dir: Path | None = None
        self._service_configs: dict[str, ServiceOverlay] = {}
        self._polling_active: bool = False

        # Generate session ID on init
        self._session_id = uuid.uuid4().hex[:12]
        if hasattr(ownerComp.par, "Sessionid"):
            ownerComp.par.Sessionid = self._session_id

        # Orphan cleanup on init
        if hasattr(ownerComp.par, "Orphancleanup") and ownerComp.par.Orphancleanup:
            self._cleanup_orphans()

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

    # ------------------------------------------------------------------
    # Docker status
    # ------------------------------------------------------------------

    def _require_docker(self) -> bool:
        """Check Docker is running. Logs error if not. Returns True if OK."""
        status = check_docker()
        if not status.available:
            self._log(f"ERROR: {status.message}")
            return False
        return True

    def _check_docker(self) -> None:
        """Manual Docker status check (pulse button)."""
        status = check_docker()
        self._log(status.message)

    def _start_docker(self) -> None:
        """Launch Docker Desktop."""
        msg = start_docker_desktop()
        self._log(msg)

    # ------------------------------------------------------------------
    # Core lifecycle
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Parse and validate the compose file, create container COMPs."""
        if not self._require_docker():
            return
        compose_path = self._get_compose_path()
        if not compose_path:
            return

        self._compose_dir = compose_path.parent
        self._log(f"Loading compose file: {compose_path}")

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

        # Clear existing container COMPs
        self._destroy_container_comps()

        # Create one COMP per service
        containers_comp = self._get_containers_comp()
        for i, (svc_name, svc_cfg) in enumerate(services.items()):
            self._create_container_comp(containers_comp, svc_name, svc_cfg, i)

        # Generate overlay
        config = OverlayConfig(
            session_id=self._session_id,
            service_overrides=self._service_configs,
        )
        try:
            self._overlay_path = write_overlay(
                compose_path, config, output_dir=self._compose_dir
            )
            self._log(f"Overlay written: {self._overlay_path}")
        except ValueError as e:
            self._log(f"ERROR generating overlay: {e}")
            return

        # Update status table
        self._update_status_table(services)
        self._log(f"Loaded {len(services)} service(s)")

    def _up(self) -> None:
        """Start all containers via docker compose."""
        if not self._require_docker():
            return
        compose_path = self._get_compose_path()
        if not compose_path or not self._overlay_path:
            self._log("ERROR: Must Load before Up")
            return

        self._log("Starting containers...")
        result = compose_up(
            compose_path,
            self._overlay_path,
            self._session_id,
        )

        if result.ok:
            self._log("Containers started successfully")
            # Spawn watchdog
            if (
                hasattr(self.ownerComp.par, "Autoshutdown")
                and self.ownerComp.par.Autoshutdown
            ):
                self._spawn_watchdog()
            # Start status polling
            self._start_polling()
            # Update container IDs
            self._refresh_container_ids()
        else:
            self._log(f"ERROR: compose up failed:\n{result.stderr}")

    def _down(self) -> None:
        """Stop all containers via docker compose."""
        if not self._session_id:
            return

        self._log("Stopping containers...")

        # Signal watchdog for clean shutdown
        if self._compose_dir:
            send_shutdown_signal(self._compose_dir)

        result = compose_down(self._session_id)
        if result.ok:
            self._log("Containers stopped")
        else:
            self._log(f"WARNING: compose down issues:\n{result.stderr}")

        self._stop_polling()
        self._watchdog_pid = None

        # Refresh displays to show exited state
        self.PollStatus()

    def _rebuild(self) -> None:
        """Down + destroy COMPs + re-Load + Up."""
        self._down()
        self._destroy_container_comps()
        self._load()
        self._up()

    def _view_logs(self) -> None:
        """Fetch compose logs into the log DAT."""
        if not self._session_id:
            return
        result = compose_logs(self._session_id, tail=200)
        log_dat = self.ownerComp.op("log")
        if log_dat:
            log_dat.text = result.stdout if result.ok else result.stderr

    # ------------------------------------------------------------------
    # NDI overlay regeneration
    # ------------------------------------------------------------------

    def NotifyNdiChanged(self, svc_name: str, enabled: bool) -> None:
        """Called by container ext when NDI transport is toggled."""
        if svc_name in self._service_configs:
            self._service_configs[svc_name].ndi_enabled = enabled
            self._regenerate_overlay()

    def _regenerate_overlay(self) -> None:
        """Re-generate overlay and apply changes (e.g., after NDI toggle)."""
        compose_path = self._get_compose_path()
        if not compose_path or not self._overlay_path:
            return
        config = OverlayConfig(
            session_id=self._session_id,
            service_overrides=self._service_configs,
        )
        try:
            self._overlay_path = write_overlay(
                compose_path, config, output_dir=self._compose_dir
            )
        except ValueError as e:
            self._log(f"ERROR regenerating overlay: {e}")
            return
        result = compose_up(compose_path, self._overlay_path, self._session_id)
        if result.ok:
            self._log("Overlay regenerated and applied")
        else:
            self._log(f"WARNING: overlay reapply failed: {result.stderr}")

    # ------------------------------------------------------------------
    # Watchdog
    # ------------------------------------------------------------------

    def _spawn_watchdog(self) -> None:
        if not self._compose_dir:
            return
        td_pid = os.getpid()
        self._watchdog_pid = spawn_watchdog(
            td_pid, self._session_id, self._compose_dir
        )
        self._log(f"Watchdog spawned (PID {self._watchdog_pid})")

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
        self, parent_comp, svc_name: str, svc_cfg: dict, index: int = 0,
    ) -> None:
        """Create a container COMP for a service using the template."""
        safe_name = self._sanitize_name(svc_name)

        # Try to load from template TOX, fall back to creating a base COMP
        template_path = self.ownerComp.par.Containertemplate.eval() if hasattr(
            self.ownerComp.par, "Containertemplate"
        ) else ""

        if template_path and Path(template_path).exists():
            comp = parent_comp.loadTox(template_path)
            comp.name = safe_name
        else:
            comp = parent_comp.create("baseCOMP", safe_name)

        # Position container COMPs side by side
        comp.nodeX = index * 250
        comp.nodeY = 0
        comp.viewer = True

        # Set up the extension if not from template
        self._init_container_comp(comp, svc_name, svc_cfg)

    def _init_container_comp(self, comp, svc_name: str, svc_cfg: dict) -> None:
        """Initialize custom parameters on a container COMP."""
        image = svc_cfg.get("image", "")

        # Create custom parameter pages if they don't exist
        if not comp.customPages:
            info_page = comp.appendCustomPage("Info")
            info_page.appendStr("Servicename", label="Service Name")[0].val = svc_name
            info_page.appendStr("Image", label="Image")[0].val = image
            info_page.appendStr("Containerid", label="Container ID")[0].val = ""
            _add_menu(
                info_page, "State", "State",
                ["created", "running", "paused", "exited", "dead"],
                ["Created", "Running", "Paused", "Exited", "Dead"],
                "created",
            )
            _add_menu(
                info_page, "Health", "Health",
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
            _add_menu(
                transport_page, "Datatransport", "Data Transport",
                ["none", "websocket", "osc"],
                ["None", "WebSocket", "OSC"],
                "none",
            )
            transport_page.appendInt("Dataport", label="Data Port")[0].val = 0
            _add_menu(
                transport_page, "Videotransport", "Video Transport",
                ["none", "ndi"],
                ["None", "NDI"],
                "none",
            )
            transport_page.appendStr("Ndisource", label="NDI Source")[0].val = ""
        else:
            # Template loaded — just update values
            if hasattr(comp.par, "Servicename"):
                comp.par.Servicename = svc_name
            if hasattr(comp.par, "Image"):
                comp.par.Image = image

        # Store service overlay config
        self._service_configs[svc_name] = ServiceOverlay(ndi_enabled=False)

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
        comp.par.ext0object = (
            f"op('{comp.path}/td_container_ext').module.TDContainerExt(me)"
        )
        comp.par.ext0promote = True

        # Parameter execute DAT — routes pulse/value callbacks to extension
        if not comp.op("parexec1"):
            pe = comp.create("parameterexecuteDAT", "parexec1")
            pe.par.op = comp.path
            pe.par.pars = "Start Stop Restart Logs Datatransport Videotransport Ndisource"
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
    def _layout_container_ops(comp) -> None:
        """Position internal operators in a tidy grid."""
        layout = {
            # Row 1: display + log
            "status_display":    (0, 0),
            "log_dat":           (250, 0),
            # Row 2: extension + parexec
            "td_container_ext":  (0, -150),
            "parexec1":          (250, -150),
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

    def _destroy_container_comps(self) -> None:
        """Remove all child COMPs from /containers."""
        containers = self.ownerComp.op("containers")
        if containers is None:
            return
        for child in containers.children:
            child.destroy()
        self._service_configs.clear()

    # ------------------------------------------------------------------
    # Status polling
    # ------------------------------------------------------------------

    _POLL_SCRIPT = (
        "def poll():\n"
        "\ttry:\n"
        "\t\ttd_docker = op('/TDDocker')\n"
        "\t\text = td_docker.ext.TDDockerExt\n"
        "\t\tif ext and getattr(ext, '_polling_active', False):\n"
        "\t\t\text.PollStatus()\n"
        "\t\t\t# Schedule next poll in 2 seconds\n"
        "\t\t\trun('op(\\\"/TDDocker/poll_script\\\").module.poll()',\n"
        "\t\t\t    delayFrames=int(2 * me.time.rate))\n"
        "\texcept Exception as e:\n"
        "\t\tprint(f'Poll error: {e}')\n"
    )

    def _ensure_poll_script(self) -> None:
        """Create the poll_script DAT if it doesn't exist."""
        ps = self.ownerComp.op("poll_script")
        if not ps:
            ps = self.ownerComp.create("textDAT", "poll_script")
            ps.nodeX = 400
            ps.nodeY = -100
            ps.viewer = True
        ps.text = self._POLL_SCRIPT

    def _start_polling(self) -> None:
        """Start the polling loop via poll_script DAT."""
        self._polling_active = True
        self._ensure_poll_script()
        ps = self.ownerComp.op("poll_script")
        if ps and hasattr(ps, "module") and hasattr(ps.module, "poll"):
            ps.module.poll()

    def _stop_polling(self) -> None:
        """Stop the polling loop."""
        self._polling_active = False

    def PollStatus(self) -> None:
        """Called by the timer CHOP callback — refresh container states."""
        if not self._session_id:
            return

        statuses = compose_ps(self._session_id)
        containers_comp = self.ownerComp.op("containers")
        if not containers_comp:
            return

        status_map = {s.service: s for s in statuses}

        for child in containers_comp.children:
            svc_name = child.par.Servicename.eval() if hasattr(child.par, "Servicename") else ""
            if svc_name in status_map:
                st = status_map[svc_name]
                if hasattr(child.par, "Containerid"):
                    child.par.Containerid = st.container_id
                if hasattr(child.par, "State"):
                    child.par.State = st.state
                health = st.health if st.health else "none"
                if hasattr(child.par, "Health"):
                    child.par.Health = health
                self._update_container_display(child, st.state, health)
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
        self._update_status_from_compose(statuses)

    def _refresh_container_ids(self) -> None:
        """One-shot refresh of container IDs after compose up."""
        self.PollStatus()

    def _update_status_table(self, services: dict) -> None:
        """Initialize the status table DAT with service names."""
        status_dat = self.ownerComp.op("status")
        if not status_dat:
            return
        status_dat.clear()
        status_dat.appendRow(["service", "state", "health", "container_id", "image"])
        for svc_name, svc_cfg in services.items():
            status_dat.appendRow([
                svc_name,
                "loaded",
                "",
                "",
                svc_cfg.get("image", ""),
            ])

    def _update_status_from_compose(self, statuses) -> None:
        """Update status table from compose_ps results."""
        status_dat = self.ownerComp.op("status")
        if not status_dat:
            return
        status_dat.clear()
        status_dat.appendRow(["service", "state", "health", "container_id", "image"])
        for st in statuses:
            status_dat.appendRow([
                st.service,
                st.state,
                st.health or "",
                st.container_id,
                st.image,
            ])

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
        if (
            hasattr(self.ownerComp.par, "Autoshutdown")
            and self.ownerComp.par.Autoshutdown
        ):
            self._down()
