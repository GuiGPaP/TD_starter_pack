"""Layout helpers for TouchDesigner operators — pure duck-typing, no ``td`` import."""

from __future__ import annotations


def move_with_docked(target, x: int, y: int) -> None:
    """Move *target* and all its docked DATs (GLSL TOP/MAT, Script SOP) together."""
    dx, dy = x - target.nodeX, y - target.nodeY
    target.nodeX, target.nodeY = x, y
    for d in target.docked:
        d.nodeX += dx
        d.nodeY += dy


def chain_ops(ops_list, spacing_x: int = 200) -> None:
    """Connect a list of operators left-to-right with uniform spacing.

    Each op (from index 1 onward) is connected to the previous one via
    ``inputConnectors[0]`` and positioned *spacing_x* pixels to the right.
    Does nothing for empty or single-element lists.
    """
    for i in range(1, len(ops_list)):
        ops_list[i].inputConnectors[0].connect(ops_list[i - 1])
        ops_list[i].nodeX = ops_list[i - 1].nodeX + spacing_x
        ops_list[i].nodeY = ops_list[i - 1].nodeY


def get_bounds(op_node) -> tuple[int, int, int, int]:
    """Return *(min_x, min_y, max_x, max_y)* including docked operators."""
    min_x = op_node.nodeX
    min_y = op_node.nodeY
    max_x = op_node.nodeX + op_node.nodeWidth
    max_y = op_node.nodeY + op_node.nodeHeight

    for d in op_node.docked:
        min_x = min(min_x, d.nodeX)
        min_y = min(min_y, d.nodeY)
        max_x = max(max_x, d.nodeX + d.nodeWidth)
        max_y = max(max_y, d.nodeY + d.nodeHeight)

    return (min_x, min_y, max_x, max_y)


def place_below(reference, target, gap: int | None = None) -> None:
    """Place *target* below *reference*.

    When *gap* is ``None`` the spacing is auto-detected:
    160 if the reference's ``OPType`` contains ``"COMP"``, 130 otherwise.
    """
    if gap is None:
        gap = 160 if "COMP" in getattr(reference, "OPType", "") else 130

    _, _, _, ref_max_y = get_bounds(reference)
    target.nodeX = reference.nodeX
    target.nodeY = ref_max_y + gap
