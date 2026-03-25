"""Layout helpers for TouchDesigner operators — pure duck-typing, no ``td`` import."""

from __future__ import annotations

import math


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


def _snap(value: int | float, grid: int) -> int:
    """Round *value* to the nearest multiple of *grid*."""
    if grid <= 0:
        return int(value)
    return int(round(value / grid) * grid)


def auto_position(
    parent,
    new_node,
    spacing_x: int = 200,
    spacing_y: int = 150,
    grid: int = 50,
) -> None:
    """Position *new_node* intelligently within *parent* COMP.

    Strategy:
    - If no siblings, place at (0, 0).
    - Otherwise, place to the right of the rightmost sibling (chain continuation).
    - If the row gets too long (>5 nodes at same Y), start a new row below.
    - All coordinates are grid-snapped.
    """
    siblings = [c for c in parent.children if c is not new_node]
    if not siblings:
        new_node.nodeX = 0
        new_node.nodeY = 0
        return

    # Find the rightmost sibling
    rightmost = max(siblings, key=lambda c: c.nodeX)

    # Count how many siblings share the same Y (approximate row detection)
    row_y = rightmost.nodeY
    row_count = sum(1 for c in siblings if abs(c.nodeY - row_y) < 30)

    if row_count >= 5:
        # Start a new row below all existing nodes
        leftmost_x = min(c.nodeX for c in siblings)
        bottom_y = max(get_bounds(c)[3] for c in siblings)
        new_node.nodeX = _snap(leftmost_x, grid)
        new_node.nodeY = _snap(bottom_y + spacing_y, grid)
    else:
        # Continue the row to the right
        _, _, right_edge, _ = get_bounds(rightmost)
        new_node.nodeX = _snap(right_edge + spacing_x, grid)
        new_node.nodeY = _snap(rightmost.nodeY, grid)


def layout_horizontal(
    nodes,
    spacing: int = 200,
    start_x: int | None = None,
    start_y: int | None = None,
) -> list[tuple[object, int, int]]:
    """Lay out *nodes* in a left-to-right row.

    Returns a list of ``(node, x, y)`` tuples **and** applies the positions.
    """
    if not nodes:
        return []

    sx = start_x if start_x is not None else nodes[0].nodeX
    sy = start_y if start_y is not None else nodes[0].nodeY
    result = []

    for i, node in enumerate(nodes):
        x = sx + i * spacing
        move_with_docked(node, x, sy)
        result.append((node, x, sy))

    return result


def layout_vertical(
    nodes,
    spacing: int = 150,
    start_x: int | None = None,
    start_y: int | None = None,
) -> list[tuple[object, int, int]]:
    """Lay out *nodes* in a top-to-bottom column.

    Uses :func:`get_bounds` to account for docked operators.
    Returns a list of ``(node, x, y)`` tuples **and** applies the positions.
    """
    if not nodes:
        return []

    sx = start_x if start_x is not None else nodes[0].nodeX
    sy = start_y if start_y is not None else nodes[0].nodeY
    result = []
    current_y = sy

    for node in nodes:
        move_with_docked(node, sx, current_y)
        result.append((node, sx, current_y))
        _, _, _, max_y = get_bounds(node)
        current_y = max_y + spacing

    return result


def layout_grid(
    nodes,
    spacing_x: int = 200,
    spacing_y: int = 150,
    start_x: int | None = None,
    start_y: int | None = None,
    cols: int | None = None,
) -> list[tuple[object, int, int]]:
    """Lay out *nodes* in a grid, row by row.

    *cols* defaults to ``ceil(sqrt(len(nodes)))``.
    Returns a list of ``(node, x, y)`` tuples **and** applies the positions.
    """
    if not nodes:
        return []

    n = len(nodes)
    if cols is None:
        cols = math.ceil(math.sqrt(n))
    cols = max(1, cols)

    sx = start_x if start_x is not None else nodes[0].nodeX
    sy = start_y if start_y is not None else nodes[0].nodeY
    result = []

    for i, node in enumerate(nodes):
        row, col = divmod(i, cols)
        x = sx + col * spacing_x
        y = sy + row * spacing_y
        move_with_docked(node, x, y)
        result.append((node, x, y))

    return result
