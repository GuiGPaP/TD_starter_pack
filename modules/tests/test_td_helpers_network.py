"""Tests for td_helpers.network — network composition helpers."""

from __future__ import annotations

import pytest

from td_helpers.network import setup_feedback_loop, setup_geometry_comp, setup_instancing


# ── Fake objects ──────────────────────────────────────────────────────


class MockConnector:
    def __init__(self):
        self.connected_to = None

    def connect(self, other):
        self.connected_to = other


class MockPar:
    """Free-form attribute bag simulating TD's par.* namespace."""

    def __getattr__(self, name: str):
        return None

    def __setattr__(self, name: str, value):
        object.__setattr__(self, name, value)


class MockOp:
    def __init__(self, name: str = "op1", parent=None):
        self.name = name
        self.nodeX = 0
        self.nodeY = 0
        self.nodeWidth = 100
        self.nodeHeight = 80
        self.docked: list = []
        self.inputConnectors = [MockConnector()]
        self.viewer = False
        self.OPType = "baseCOMP"
        self.par = MockPar()
        self.children: list = []
        self.display = False
        self.render = False
        self._parent = parent

    def destroy(self):
        if self._parent and self in self._parent.children:
            self._parent.children.remove(self)


class MockContainer(MockOp):
    """Container that supports ``.create()`` with recursive COMP handling."""

    def __init__(self, *, default_children: list[str] | None = None, **kwargs):
        super().__init__(**kwargs)
        self._created: list = []
        if default_children:
            for child_name in default_children:
                child = MockOp(name=child_name, parent=self)
                self.children.append(child)

    def create(self, op_type: str, name: str):
        if "COMP" in op_type:
            defaults = ["torus1"] if op_type == "geometryCOMP" else None
            child = MockContainer(name=name, default_children=defaults, parent=self)
        else:
            child = MockOp(name=name, parent=self)
        child.OPType = op_type
        self._created.append(child)
        self.children.append(child)
        return child


# ── setup_geometry_comp ──────────────────────────────────────────────


class TestSetupGeometryComp:
    def test_sop_mode(self):
        base = MockContainer(name="base")
        geo, in_op, out_op = setup_geometry_comp(base, "geo1")

        assert geo.OPType == "geometryCOMP"
        assert in_op.OPType == "inSOP"
        assert out_op.OPType == "outSOP"

    def test_pop_mode(self):
        base = MockContainer(name="base")
        geo, in_op, out_op = setup_geometry_comp(base, "geo1", pop=True)

        assert in_op.OPType == "inPOP"
        assert out_op.OPType == "outPOP"

    def test_position(self):
        base = MockContainer(name="base")
        geo, _, _ = setup_geometry_comp(base, "geo1", x=200, y=300)

        assert geo.nodeX == 200
        assert geo.nodeY == 300

    def test_default_children_removed(self):
        """The default torus inside geometryCOMP must be destroyed."""
        base = MockContainer(name="base")
        geo, _, _ = setup_geometry_comp(base, "geo1")

        child_names = [c.name for c in geo.children]
        assert "torus1" not in child_names

    def test_out_connected_to_in(self):
        base = MockContainer(name="base")
        _, in_op, out_op = setup_geometry_comp(base, "geo1")

        assert out_op.inputConnectors[0].connected_to is in_op

    def test_viewer_and_flags(self):
        base = MockContainer(name="base")
        geo, in_op, out_op = setup_geometry_comp(base, "geo1")

        assert geo.viewer is True
        assert in_op.viewer is True
        assert out_op.viewer is True
        assert out_op.display is True
        assert out_op.render is True

    def test_types_are_strings(self):
        """Operator types must be passed as strings, not TD globals."""
        base = MockContainer(name="base")
        setup_geometry_comp(base, "geo1")

        types_created = [c.OPType for c in base._created]
        assert all(isinstance(t, str) for t in types_created)


# ── setup_feedback_loop ──────────────────────────────────────────────


class TestSetupFeedbackLoop:
    def test_default_process_type(self):
        base = MockContainer(name="base")
        result = setup_feedback_loop(base, "sim")

        assert result["process"].OPType == "glslTOP"

    def test_custom_process_type(self):
        base = MockContainer(name="base")
        result = setup_feedback_loop(base, "sim", process_type="compositeTOP")

        assert result["process"].OPType == "compositeTOP"

    def test_connections(self):
        base = MockContainer(name="base")
        result = setup_feedback_loop(base, "sim")

        fb = result["feedback"]
        proc = result["process"]
        null = result["null_out"]
        const = result["const_init"]

        # const_init → feedback → process → null_out
        assert fb.inputConnectors[0].connected_to is const
        assert proc.inputConnectors[0].connected_to is fb
        assert null.inputConnectors[0].connected_to is proc

    def test_feedback_par_top(self):
        base = MockContainer(name="base")
        result = setup_feedback_loop(base, "sim")

        assert result["feedback"].par.top == "sim_out"

    def test_layout_spacing(self):
        base = MockContainer(name="base")
        result = setup_feedback_loop(base, "sim", x=100, y=50)

        assert result["const_init"].nodeX == 100
        assert result["feedback"].nodeX == 300
        assert result["process"].nodeX == 500
        assert result["null_out"].nodeX == 700
        # All same Y
        for op in result.values():
            assert op.nodeY == 50


# ── setup_instancing ─────────────────────────────────────────────────


class TestSetupInstancing:
    def test_basic(self):
        geo = MockOp(name="geo1")
        setup_instancing(geo, "null_chop")

        assert geo.par.instancing is True
        assert geo.par.instanceop == "null_chop"
        assert geo.par.instancetx == "tx"
        assert geo.par.instancety == "ty"
        assert geo.par.instancetz == "tz"

    def test_custom_channels(self):
        geo = MockOp(name="geo1")
        setup_instancing(geo, "chop1", tx="px", ty="py", tz="pz")

        assert geo.par.instancetx == "px"
        assert geo.par.instancety == "py"
        assert geo.par.instancetz == "pz"
