"""Reusable helpers for TouchDesigner network creation and layout.

All helpers use duck-typing — they never import the ``td`` module.
Operator types are passed as plain strings (e.g. ``"geometryCOMP"``).
"""

from td_helpers.layout import chain_ops, get_bounds, move_with_docked, place_below
from td_helpers.network import setup_feedback_loop, setup_geometry_comp, setup_instancing

__all__ = [
    "chain_ops",
    "get_bounds",
    "move_with_docked",
    "place_below",
    "setup_feedback_loop",
    "setup_geometry_comp",
    "setup_instancing",
]
