"""OSC data bridge — pure Python logic for TD OSC In/Out DAT integration.

Handles incoming OSC message parsing into table rows.
No TouchDesigner imports — all TD interaction happens via td_container_ext.py.
"""

from __future__ import annotations


class OscBridge:
    """Manages OSC message parsing into table rows.

    Used by the TD callback script to parse incoming OSC messages
    into rows in an osc_data tableDAT.
    """

    def __init__(self, service_name: str, *, max_rows: int = 1000) -> None:
        self.service_name = service_name
        self.max_rows = max_rows

    def parse_message(
        self,
        address: str,
        args: list,
    ) -> dict[str, str]:
        """Parse an OSC message into a single table row.

        Returns a dict with keys: address, arg0, arg1, ...
        """
        row: dict[str, str] = {"address": address}
        for i, arg in enumerate(args):
            row[f"arg{i}"] = str(arg)
        return row

    @staticmethod
    def header_for_args(n_args: int) -> list[str]:
        """Generate header row for a given max number of args."""
        return ["address", *[f"arg{i}" for i in range(n_args)]]


# ---------------------------------------------------------------------------
# TD Callback Script — injected into a textDAT at runtime
# ---------------------------------------------------------------------------

CALLBACK_SCRIPT = """\
import sys
import os

_py = os.path.join(project.folder, 'python')
if _py not in sys.path:
    sys.path.insert(0, _py)

from td_docker.transports.osc import OscBridge

_bridge = None
_max_args_seen = 0


def _get_bridge():
    global _bridge
    if _bridge is None:
        svc = parent().par.Servicename.eval() if hasattr(parent().par, 'Servicename') else 'unknown'
        _bridge = OscBridge(svc)
    return _bridge


def onReceiveOSC(dat, rowIndex, message, bytes, timeStamp, address, args, peer):
    bridge = _get_bridge()
    log = parent().op('log_dat')
    if log:
        args_str = ', '.join(str(a) for a in args)
        log.text += f'[{bridge.service_name}] OSC {address} [{args_str}]\\n'
"""
