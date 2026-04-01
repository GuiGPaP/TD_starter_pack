"""TDContainerExt — Per-container extension for container COMPs.

Handles individual container actions (start/stop/restart/logs)
and transport setup (WebSocket, NDI).
Loaded as an extension on each container COMP created by TDDockerExt.
"""

from __future__ import annotations

from typing import ClassVar

from td_docker.container_manager import (
    container_logs,
    restart_container,
    start_container,
    stop_container,
)


class TDContainerExt:
    """Extension class for individual container COMPs."""

    def __init__(self, ownerComp):
        self.ownerComp = ownerComp

    # ------------------------------------------------------------------
    # Parameter callbacks
    # ------------------------------------------------------------------

    def onParPulse(self, par):
        name = par.name
        if name == "Start":
            self._start()
        elif name == "Stop":
            self._stop()
        elif name == "Restart":
            self._restart()
        elif name == "Logs":
            self._fetch_logs()

    def onParValueChange(self, par, prev):
        name = par.name
        if name == "Oscenable":
            self._configure_osc()
            self._sync_enables_and_layout()
        elif name == "Wsenable":
            self._configure_websocket()
            self._sync_enables_and_layout()
        elif name == "Ndienable":
            self._configure_ndi()
            self._sync_enables_and_layout()
        elif name == "Ndisource":
            self._update_ndi_source()

    # ------------------------------------------------------------------
    # Container actions
    # ------------------------------------------------------------------

    def _get_container_id(self) -> str:
        cid = ""
        if hasattr(self.ownerComp.par, "Containerid"):
            cid = self.ownerComp.par.Containerid.eval()
        if not cid:
            self._log("ERROR: No container ID — is the container running?")
        return cid

    def _run_container_action(self, action_fn, action_name: str, cid: str) -> None:
        """Run a container action via the orchestrator's thread pool."""
        result_holder = [None]
        orchestrator = self._find_orchestrator()

        def _worker():
            result_holder[0] = action_fn(cid)

        def _on_success():
            result = result_holder[0]
            if result and result.ok:
                self._log(f"Container {action_name}")
            elif result and "No such container" in result.stderr:
                self._log(
                    "ERROR: Container no longer exists — press Rebuild on TDDocker"
                )
            elif result:
                self._log(f"ERROR {action_name}: {result.stderr}")
            self._refresh_orchestrator()

        if orchestrator and hasattr(orchestrator.ext, "TDDockerExt"):
            orchestrator.ext.TDDockerExt._enqueue_task(
                target=_worker, success_hook=_on_success,
            )
        else:
            _worker()
            _on_success()

    def _start(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        self._run_container_action(start_container, "started", cid)

    def _stop(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        self._run_container_action(stop_container, "stopped", cid)

    def _restart(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        self._run_container_action(restart_container, "restarted", cid)

    def _find_orchestrator(self):
        """Walk up the COMP hierarchy to find the TDDockerExt orchestrator."""
        comp = self.ownerComp.parent()
        while comp:
            if hasattr(comp, "ext") and hasattr(comp.ext, "TDDockerExt"):
                return comp
            comp = comp.parent()
        return None

    def _refresh_orchestrator(self) -> None:
        """Tell the orchestrator to refresh all container statuses."""
        orchestrator = self._find_orchestrator()
        if orchestrator:
            orchestrator.ext.TDDockerExt.PollStatus()

    def _fetch_logs(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        result_holder = [None]
        orchestrator = self._find_orchestrator()

        def _worker():
            result_holder[0] = container_logs(cid, tail=200)

        def _on_success():
            result = result_holder[0]
            log_dat = self.ownerComp.op("log_dat")
            if log_dat and result:
                log_dat.text = result.stdout if result.ok else result.stderr

        if orchestrator and hasattr(orchestrator.ext, "TDDockerExt"):
            orchestrator.ext.TDDockerExt._enqueue_task(
                target=_worker, success_hook=_on_success,
            )
        else:
            _worker()
            _on_success()

    # ------------------------------------------------------------------
    # Transport configuration
    # ------------------------------------------------------------------

    # Expected operators per transport toggle
    _TRANSPORT_OPS: ClassVar[dict[str, tuple[str, ...]]] = {
        "osc": ("osc_in", "osc_out", "oscin_callbacks"),
        "ws": ("websocket_dat", "websocket_callbacks"),
        "ndi": ("video_in", "video_out"),
    }

    def ensureTransports(self) -> None:
        """Recreate transport operators only if they are missing.

        Called after a .toe restore to materialise operators that match
        the persisted toggle values without destroying anything that
        already exists.
        """
        checks = [
            ("osc", "Oscenable", self._configure_osc),
            ("ws", "Wsenable", self._configure_websocket),
            ("ndi", "Ndienable", self._configure_ndi),
        ]
        for key, enable_par, configure_fn in checks:
            enabled = bool(
                getattr(self.ownerComp.par, enable_par, None)
                and self.ownerComp.par[enable_par].eval()
            )
            expected = self._TRANSPORT_OPS[key]
            if enabled and any(not self.ownerComp.op(n) for n in expected):
                configure_fn()

    def _configure_osc(self) -> None:
        """Create or destroy OSC operators based on Oscenable toggle."""
        enabled = bool(
            hasattr(self.ownerComp.par, "Oscenable")
            and self.ownerComp.par.Oscenable.eval()
        )

        # Tear down
        for op_name in self._TRANSPORT_OPS["osc"]:
            existing = self.ownerComp.op(op_name)
            if existing:
                existing.destroy()

        if not enabled:
            self._log("OSC transport disabled")
            return

        osc_in = self.ownerComp.create("oscinDAT", "osc_in")
        osc_out = self.ownerComp.create("oscoutDAT", "osc_out")
        osc_in.par.port.bindExpr = "parent().par.Oscinport"
        osc_out.par.port.bindExpr = "parent().par.Oscoutport"

        from td_docker.transports.osc import CALLBACK_SCRIPT as OSC_SCRIPT

        cb = self.ownerComp.create("textDAT", "oscin_callbacks")
        cb.text = OSC_SCRIPT
        osc_in.par.callbacks = cb

        self._log("OSC transport enabled")

    def _configure_websocket(self) -> None:
        """Create or destroy WebSocket operators based on Wsenable toggle."""
        enabled = bool(
            hasattr(self.ownerComp.par, "Wsenable")
            and self.ownerComp.par.Wsenable.eval()
        )

        # Tear down
        for op_name in self._TRANSPORT_OPS["ws"]:
            existing = self.ownerComp.op(op_name)
            if existing:
                existing.destroy()

        if not enabled:
            self._log("WebSocket transport disabled")
            return

        ws = self.ownerComp.create("websocketDAT", "websocket_dat")
        ws.par.port.bindExpr = "parent().par.Wsport"

        from td_docker.transports.websocket import CALLBACK_SCRIPT

        cb = self.ownerComp.create("textDAT", "websocket_callbacks")
        cb.text = CALLBACK_SCRIPT
        ws.par.callbacks = cb

        self._log("WebSocket transport enabled")

    def _configure_ndi(self) -> None:
        """Create or destroy NDI operators based on Ndienable toggle."""
        enabled = bool(
            hasattr(self.ownerComp.par, "Ndienable")
            and self.ownerComp.par.Ndienable.eval()
        )

        # Notify orchestrator when disabling
        if not enabled:
            self._notify_ndi_enabled(False)

        # Tear down
        for op_name in self._TRANSPORT_OPS["ndi"]:
            existing = self.ownerComp.op(op_name)
            if existing:
                existing.destroy()

        if not enabled:
            self._log("NDI transport disabled")
            return

        ndi_in = self.ownerComp.create("ndiin", "video_in")
        self.ownerComp.create("ndiout", "video_out")

        ndi_source = ""
        if hasattr(self.ownerComp.par, "Ndisource"):
            ndi_source = self.ownerComp.par.Ndisource.eval()
        if ndi_source and hasattr(ndi_in.par, "sourcename"):
            ndi_in.par.sourcename = ndi_source

        self._log(f"NDI transport enabled (source: {ndi_source or 'auto'})")
        self._notify_ndi_enabled(True)

    def _update_ndi_source(self) -> None:
        """Update NDI In source name when parameter changes."""
        ndi_in = self.ownerComp.op("video_in")
        if ndi_in and hasattr(ndi_in.par, "sourcename"):
            source = self.ownerComp.par.Ndisource.eval() if hasattr(
                self.ownerComp.par, "Ndisource"
            ) else ""
            ndi_in.par.sourcename = source

    def _notify_ndi_enabled(self, enabled: bool) -> None:
        """Tell the orchestrator this service needs network_mode: host."""
        orchestrator = self._find_orchestrator()
        if not orchestrator:
            return
        svc_name = ""
        if hasattr(self.ownerComp.par, "Servicename"):
            svc_name = self.ownerComp.par.Servicename.eval()
        project_name = ""
        if hasattr(self.ownerComp.par, "Projectname"):
            project_name = self.ownerComp.par.Projectname.eval()
        if svc_name and project_name:
            orchestrator.ext.TDDockerExt.NotifyNdiChanged(
                project_name, svc_name, enabled
            )

    def _sync_enables_and_layout(self) -> None:
        """Grey out sub-params and re-layout operators after toggle change."""
        from td_docker.td_docker_ext import TDDockerExt

        TDDockerExt._sync_transport_enables(self.ownerComp)
        TDDockerExt._layout_container_ops(self.ownerComp)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _log(self, msg: str) -> None:
        svc = ""
        if hasattr(self.ownerComp.par, "Servicename"):
            svc = self.ownerComp.par.Servicename.eval()
        prefix = f"[{svc}]" if svc else "[container]"
        print(f"{prefix} {msg}")
        log_dat = self.ownerComp.op("log_dat")
        if log_dat:
            log_dat.text += msg + "\n"
