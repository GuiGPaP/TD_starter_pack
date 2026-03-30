"""TDContainerExt — Per-container extension for container COMPs.

Handles individual container actions (start/stop/restart/logs)
and transport setup (WebSocket, NDI).
Loaded as an extension on each container COMP created by TDDockerExt.
"""

from __future__ import annotations

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
        if name == "Datatransport":
            self._configure_data_transport()
        elif name == "Videotransport":
            self._configure_video_transport()
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

    def _start(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        result = start_container(cid)
        if result.ok:
            self._log("Container started")
        else:
            self._log(f"ERROR starting container: {result.stderr}")

    def _stop(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        result = stop_container(cid)
        if result.ok:
            self._log("Container stopped")
        else:
            self._log(f"ERROR stopping container: {result.stderr}")

    def _restart(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        result = restart_container(cid)
        if result.ok:
            self._log("Container restarted")
        else:
            self._log(f"ERROR restarting container: {result.stderr}")

    def _fetch_logs(self) -> None:
        cid = self._get_container_id()
        if not cid:
            return
        result = container_logs(cid, tail=200)
        log_dat = self.ownerComp.op("log_dat")
        if log_dat:
            log_dat.text = result.stdout if result.ok else result.stderr

    # ------------------------------------------------------------------
    # Transport configuration
    # ------------------------------------------------------------------

    def _configure_data_transport(self) -> None:
        """Set up or tear down the WebSocket/OSC connection."""
        transport = self.ownerComp.par.Datatransport.eval() if hasattr(
            self.ownerComp.par, "Datatransport"
        ) else "none"

        # Remove existing transport operators
        for op_name in (
            "websocket_dat", "osc_in", "osc_out",
            "data_in", "ws_callbacks", "osc_callbacks",
        ):
            existing = self.ownerComp.op(op_name)
            if existing:
                existing.destroy()

        if transport == "websocket":
            ws = self.ownerComp.create("websocketDAT", "websocket_dat")
            port = 0
            if hasattr(self.ownerComp.par, "Dataport"):
                port = int(self.ownerComp.par.Dataport.eval())
            if port > 0:
                ws.par.port = port

            # Create data_in table for parsed messages
            data_in = self.ownerComp.create("tableDAT", "data_in")

            # Create callback script and wire it to the WebSocket DAT
            from td_docker.transports.websocket import CALLBACK_SCRIPT

            cb = self.ownerComp.create("textDAT", "ws_callbacks")
            cb.text = CALLBACK_SCRIPT
            ws.par.callbacks = cb

            self._log(f"WebSocket transport configured on port {port}")
            _ = data_in  # used by callback script at runtime

        elif transport == "osc":
            osc_in = self.ownerComp.create("oscinDAT", "osc_in")
            osc_out = self.ownerComp.create("oscoutDAT", "osc_out")
            port = 0
            if hasattr(self.ownerComp.par, "Dataport"):
                port = int(self.ownerComp.par.Dataport.eval())
            if port > 0:
                osc_in.par.port = port
                osc_out.par.port = port + 1

            # Create data_in table for parsed messages
            data_in = self.ownerComp.create("tableDAT", "data_in")

            # Create callback script and wire it to the OSC In DAT
            from td_docker.transports.osc import CALLBACK_SCRIPT as OSC_SCRIPT

            cb = self.ownerComp.create("textDAT", "osc_callbacks")
            cb.text = OSC_SCRIPT
            osc_in.par.callbacks = cb

            self._log(f"OSC transport configured on ports {port}/{port + 1}")
            _ = data_in  # used by callback script at runtime

    def _configure_video_transport(self) -> None:
        """Set up or tear down NDI In/Out TOPs."""
        transport = self.ownerComp.par.Videotransport.eval() if hasattr(
            self.ownerComp.par, "Videotransport"
        ) else "none"

        # Notify orchestrator when leaving NDI mode
        if transport != "ndi":
            self._notify_ndi_enabled(False)

        # Remove existing video operators
        for op_name in ("video_in", "video_out"):
            existing = self.ownerComp.op(op_name)
            if existing:
                existing.destroy()

        if transport == "ndi":
            ndi_in = self.ownerComp.create("ndiin", "video_in")
            self.ownerComp.create("ndiout", "video_out")

            # Set NDI source if configured
            ndi_source = ""
            if hasattr(self.ownerComp.par, "Ndisource"):
                ndi_source = self.ownerComp.par.Ndisource.eval()
            if ndi_source and hasattr(ndi_in.par, "sourcename"):
                ndi_in.par.sourcename = ndi_source

            self._log(f"NDI transport configured (source: {ndi_source or 'auto'})")

            # Notify orchestrator that this service needs host mode
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
        orchestrator = self.ownerComp.parent(2)  # TDDocker COMP
        has_ext = hasattr(orchestrator, "ext") and hasattr(orchestrator.ext, "TDDockerExt")
        if orchestrator and has_ext:
            svc_name = ""
            if hasattr(self.ownerComp.par, "Servicename"):
                svc_name = self.ownerComp.par.Servicename.eval()
            if svc_name:
                orchestrator.ext.TDDockerExt.NotifyNdiChanged(svc_name, enabled)

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
