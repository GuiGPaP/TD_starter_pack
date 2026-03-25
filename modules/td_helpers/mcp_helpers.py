"""Pre-loaded helpers for execute_python_script.

These functions are injected into the ``helpers`` namespace of every
script executed via the MCP ``execute_python_script`` tool.

Usage inside a script::

    result = helpers.safe_copy("/project1/geo1", "/project1/container1")
    helpers.connect("/project1/noise1", "/project1/null1")
    nodes = helpers.find_by_tag("myTag", "/project1")
    helpers.safe_destroy("/project1/temp1")
    node = helpers.get_or_create("/project1", "textTOP", "myText")
"""

from __future__ import annotations

import td


def safe_copy(
    source_path: str,
    target_parent_path: str,
    name: str | None = None,
) -> object:
    """Copy an operator with collision handling.

    Returns the copied operator.
    Raises ``ValueError`` if source/target is invalid or target is not a COMP.
    """
    source = td.op(source_path)
    if source is None or not source.valid:
        raise ValueError(f"Source node not found: {source_path}")

    target = td.op(target_parent_path)
    if target is None or not target.valid:
        raise ValueError(f"Target parent not found: {target_parent_path}")

    if not target.isCOMP:
        raise ValueError(
            f"Target must be a COMP, got {target.OPType}: {target_parent_path}"
        )

    copied = target.copy(source, name=name)
    if copied is None or not copied.valid:
        raise ValueError(f"Failed to copy {source_path} into {target_parent_path}")

    return copied


def connect(
    from_path: str,
    to_path: str,
    from_output: int = 0,
    to_input: int = 0,
) -> None:
    """Connect two operators with family validation."""
    from_node = td.op(from_path)
    if from_node is None or not from_node.valid:
        raise ValueError(f"Source node not found: {from_path}")

    to_node = td.op(to_path)
    if to_node is None or not to_node.valid:
        raise ValueError(f"Destination node not found: {to_path}")

    if from_node.family != to_node.family:
        raise ValueError(
            f"Incompatible families: {from_node.family} -> {to_node.family}"
        )

    to_node.inputConnectors[to_input].connect(
        from_node.outputConnectors[from_output]
    )


def find_by_tag(tag: str, parent_path: str = "/") -> list:
    """Find all operators with a given tag under *parent_path*."""
    parent = td.op(parent_path)
    if parent is None or not parent.valid:
        return []

    return parent.findChildren(tags=[tag])


def safe_destroy(path: str) -> bool:
    """Destroy a node if it exists.  No-op if not found.

    Returns ``True`` if a node was destroyed, ``False`` otherwise.
    """
    node = td.op(path)
    if node is None or not node.valid:
        return False

    node.destroy()
    return True


def get_or_create(
    parent_path: str,
    op_type: str,
    name: str,
) -> object:
    """Return an existing operator or create a new one.

    If ``parent_path/name`` already exists, it is returned as-is.
    Otherwise a new operator of *op_type* is created under *parent_path*.
    """
    existing = td.op(f"{parent_path}/{name}")
    if existing is not None and existing.valid:
        return existing

    parent = td.op(parent_path)
    if parent is None or not parent.valid:
        raise ValueError(f"Parent not found: {parent_path}")

    return parent.create(op_type, name)
