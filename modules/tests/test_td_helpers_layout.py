"""Tests for td_helpers.layout — pure duck-typed layout helpers."""

from __future__ import annotations

from td_helpers.layout import chain_ops, get_bounds, move_with_docked, place_below

# ── Fake objects ──────────────────────────────────────────────────────


class MockConnector:
    def __init__(self):
        self.connected_to = None

    def connect(self, other):
        self.connected_to = other


class MockOp:
    def __init__(
        self,
        name: str = "op1",
        x: int = 0,
        y: int = 0,
        width: int = 100,
        height: int = 80,
        op_type: str = "baseCOMP",
    ):
        self.name = name
        self.nodeX = x
        self.nodeY = y
        self.nodeWidth = width
        self.nodeHeight = height
        self.docked: list[MockOp] = []
        self.inputConnectors = [MockConnector()]
        self.OPType = op_type


# ── move_with_docked ─────────────────────────────────────────────────


class TestMoveWithDocked:
    def test_no_docked(self):
        op = MockOp(x=0, y=0)
        move_with_docked(op, 100, 200)
        assert (op.nodeX, op.nodeY) == (100, 200)

    def test_with_docked(self):
        main = MockOp(x=10, y=20)
        d1 = MockOp(name="d1", x=10, y=100)
        d2 = MockOp(name="d2", x=10, y=180)
        main.docked = [d1, d2]

        move_with_docked(main, 110, 120)

        assert (main.nodeX, main.nodeY) == (110, 120)
        # delta is +100, +100
        assert (d1.nodeX, d1.nodeY) == (110, 200)
        assert (d2.nodeX, d2.nodeY) == (110, 280)

    def test_delta_correct(self):
        main = MockOp(x=50, y=50)
        d = MockOp(name="d", x=60, y=130)
        main.docked = [d]

        move_with_docked(main, 0, 0)

        # delta = -50, -50
        assert (d.nodeX, d.nodeY) == (10, 80)


# ── chain_ops ────────────────────────────────────────────────────────


class TestChainOps:
    def test_chain_three(self):
        ops = [MockOp(name=f"op{i}", x=0, y=0) for i in range(3)]
        chain_ops(ops)

        assert ops[1].nodeX == 200
        assert ops[2].nodeX == 400
        assert ops[1].nodeY == 0
        assert ops[2].nodeY == 0
        assert ops[1].inputConnectors[0].connected_to is ops[0]
        assert ops[2].inputConnectors[0].connected_to is ops[1]

    def test_custom_spacing(self):
        ops = [MockOp(name=f"op{i}", x=0, y=10) for i in range(3)]
        chain_ops(ops, spacing_x=300)

        assert ops[1].nodeX == 300
        assert ops[2].nodeX == 600

    def test_preserves_first_position(self):
        ops = [MockOp(name=f"op{i}", x=50, y=75) for i in range(2)]
        chain_ops(ops)

        assert ops[0].nodeX == 50
        assert ops[1].nodeX == 250
        assert ops[1].nodeY == 75

    def test_empty_list(self):
        chain_ops([])  # should not raise

    def test_single_op(self):
        op = MockOp()
        chain_ops([op])  # should not raise
        assert op.nodeX == 0  # unchanged

    def test_y_alignment(self):
        """All ops get the same Y as their predecessor."""
        ops = [MockOp(name=f"op{i}", x=0, y=i * 100) for i in range(3)]
        chain_ops(ops)

        assert ops[1].nodeY == 0  # aligned to ops[0]
        assert ops[2].nodeY == 0  # aligned to ops[1] (which got 0)


# ── get_bounds ───────────────────────────────────────────────────────


class TestGetBounds:
    def test_single_op(self):
        op = MockOp(x=10, y=20, width=100, height=80)
        assert get_bounds(op) == (10, 20, 110, 100)

    def test_with_docked_extending(self):
        main = MockOp(x=10, y=20, width=100, height=80)
        d = MockOp(name="d", x=10, y=100, width=100, height=200)
        main.docked = [d]

        bounds = get_bounds(main)
        assert bounds == (10, 20, 110, 300)

    def test_docked_left_of_main(self):
        main = MockOp(x=100, y=0, width=100, height=80)
        d = MockOp(name="d", x=50, y=0, width=30, height=80)
        main.docked = [d]

        min_x, _, _, _ = get_bounds(main)
        assert min_x == 50


# ── place_below ──────────────────────────────────────────────────────


class TestPlaceBelow:
    def test_auto_gap_comp(self):
        ref = MockOp(x=0, y=0, height=80, op_type="geometryCOMP")
        target = MockOp(x=999, y=999)

        place_below(ref, target)

        assert target.nodeX == 0
        assert target.nodeY == 80 + 160  # max_y + 160

    def test_auto_gap_non_comp(self):
        ref = MockOp(x=0, y=0, height=80, op_type="glslTOP")
        target = MockOp(x=999, y=999)

        place_below(ref, target)

        assert target.nodeY == 80 + 130

    def test_explicit_gap(self):
        ref = MockOp(x=0, y=0, height=80, op_type="glslTOP")
        target = MockOp()

        place_below(ref, target, gap=50)

        assert target.nodeY == 80 + 50

    def test_accounts_for_docked_bounds(self):
        ref = MockOp(x=0, y=0, height=80, op_type="glslTOP")
        d = MockOp(name="d", x=0, y=80, width=100, height=200)
        ref.docked = [d]
        target = MockOp()

        place_below(ref, target)

        # max_y = 80 + 200 = 280, gap = 130
        assert target.nodeY == 280 + 130
