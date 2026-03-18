"""Fake TD graph for smoke tests — shared module.

Provides a faithful-enough fake of the TouchDesigner object model so that
``api_service`` → ``td_helpers.network`` can run end-to-end without any
``@patch`` on the helpers.  The real helpers write via ``node.par.X = val``
and the service reads via ``node.pars("*")`` → ``par.name`` / ``par.eval()``.
"""

from __future__ import annotations

import fnmatch
from itertools import count


# ── Atomic parameter ────────────────────────────────────────────────

class FakePar:
    """A single TD parameter with ``.name`` and ``.eval()``."""

    def __init__(self, name: str, value):
        self.name = name
        self._value = value

    def eval(self):
        return self._value


# ── Parameter namespace (node.par.*) ────────────────────────────────

class FakeParNamespace:
    """``node.par.*`` — write freely, read back via ``pars("*")``."""

    def __setattr__(self, name: str, value):
        object.__setattr__(self, name, value)

    def __getattr__(self, name: str):
        # Undefined parameter → None (matches TD behaviour)
        return None


# ── Connector ───────────────────────────────────────────────────────

class FakeConnector:
    def __init__(self):
        self.connected_to = None

    def connect(self, other):
        self.connected_to = other


# ── Base operator ───────────────────────────────────────────────────

_id_counter = count(1)


class FakeOp:
    """Minimal TD operator fake.

    Attributes match what ``api_service._get_node_summary`` and the network
    helpers read/write.
    """

    def __init__(self, name: str = "op1", *, parent: FakeOp | None = None, graph: FakeGraph | None = None):
        self.id: int = next(_id_counter)
        self.name: str = name
        self.OPType: str = "baseCOMP"
        self.valid: bool = True

        self.nodeX: int = 0
        self.nodeY: int = 0
        self.nodeWidth: int = 100
        self.nodeHeight: int = 80
        self.viewer: bool = False
        self.display: bool = False
        self.render: bool = False
        self.docked: list = []

        self.par = FakeParNamespace()
        self.children: list[FakeOp] = []
        self.inputConnectors = [FakeConnector()]

        self._parent: FakeOp | None = parent
        self._graph: FakeGraph | None = graph

        # Derive path from parent
        if parent is not None:
            self.path = f"{parent.path}/{name}"
        else:
            self.path = f"/{name}"

        # Register in graph
        if self._graph is not None:
            self._graph.register(self)

    # -- Parameter reading (used by _get_node_properties) --

    def pars(self, pattern: str = "*") -> list[FakePar]:
        """Return FakePar objects for all attributes set on ``self.par``."""
        return [
            FakePar(k, v)
            for k, v in vars(self.par).items()
            if not k.startswith("_")
        ]

    # -- Children search (used by get_nodes) --

    def findChildren(self, *, name: str = "*", depth: int | None = None) -> list[FakeOp]:
        if depth == 1:
            results = list(self.children)
        else:
            results = []
            for child in self.children:
                results.append(child)
                results.extend(child.findChildren(name="*"))
        if name != "*":
            results = [c for c in results if fnmatch.fnmatch(c.name, name)]
        return results

    # -- Errors (used by get_node_errors) --

    def errors(self, recurse: bool = False) -> str:
        """No errors by default."""
        return ""

    # -- Lifecycle --

    def destroy(self):
        if self._parent is not None and self in self._parent.children:
            self._parent.children.remove(self)
        if self._graph is not None:
            self._graph.unregister(self.path)


# ── Container (supports .create()) ──────────────────────────────────

class FakeContainer(FakeOp):
    """Operator that can create children, like a COMP in TD."""

    def __init__(
        self,
        name: str = "container1",
        *,
        parent: FakeOp | None = None,
        graph: FakeGraph | None = None,
        default_children: list[str] | None = None,
    ):
        super().__init__(name, parent=parent, graph=graph)
        self._created: list[FakeOp] = []
        if default_children:
            for child_name in default_children:
                child = FakeOp(child_name, parent=self, graph=self._graph)
                self.children.append(child)

    def create(self, op_type: str, op_name: str) -> FakeOp:
        if "COMP" in op_type:
            defaults = ["torus1"] if op_type == "geometryCOMP" else None
            child = FakeContainer(
                op_name,
                parent=self,
                graph=self._graph,
                default_children=defaults,
            )
        else:
            child = FakeOp(op_name, parent=self, graph=self._graph)
        child.OPType = op_type
        self._created.append(child)
        self.children.append(child)
        return child


# ── Graph registry (td.op() lookup) ─────────────────────────────────

class FakeGraph:
    """Path → operator registry, backing ``td.op(path)``."""

    def __init__(self):
        self._nodes: dict[str, FakeOp] = {}

    def register(self, node: FakeOp):
        self._nodes[node.path] = node

    def unregister(self, path: str):
        self._nodes.pop(path, None)

    def op(self, path: str) -> FakeOp | None:
        return self._nodes.get(path)
