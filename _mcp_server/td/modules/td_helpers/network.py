"""Network composition helpers for TouchDesigner — operator types as strings."""

from __future__ import annotations


def setup_geometry_comp(
    base,
    name: str = "geo1",
    *,
    x: int = 0,
    y: int = 0,
    pop: bool = False,
) -> tuple:
    """Create a Geometry COMP with In/Out, removing the default torus.

    Parameters
    ----------
    base : duck-typed container with ``.create()``
    name : operator name
    x, y : node position
    pop : when ``True`` use ``"inPOP"``/``"outPOP"`` instead of SOP variants

    Returns
    -------
    tuple : ``(geo, in_op, out_op)``
    """
    geo = base.create("geometryCOMP", name)
    geo.viewer = True
    geo.nodeX = x
    geo.nodeY = y

    # Remove default children (e.g. torus1) — iterate over a copy
    for child in list(geo.children):
        child.destroy()

    in_type = "inPOP" if pop else "inSOP"
    out_type = "outPOP" if pop else "outSOP"

    in_op = geo.create(in_type, "in1")
    in_op.viewer = True

    out_op = geo.create(out_type, "out1")
    out_op.viewer = True
    out_op.display = True
    out_op.render = True
    out_op.inputConnectors[0].connect(in_op)

    return (geo, in_op, out_op)


def setup_feedback_loop(
    base,
    name: str = "sim",
    *,
    x: int = 0,
    y: int = 0,
    process_type: str = "glslTOP",
) -> dict:
    """Create a Feedback TOP loop: const_init → feedback → process → null_out.

    Parameters
    ----------
    base : duck-typed container
    name : base name prefix for operators
    x, y : starting position of const_init
    process_type : operator type string for the processing node

    Returns
    -------
    dict : ``{"feedback", "process", "null_out", "const_init"}``
    """
    spacing = 200

    const_init = base.create("constantTOP", f"{name}_init")
    const_init.viewer = True
    const_init.nodeX = x
    const_init.nodeY = y

    feedback = base.create("feedbackTOP", f"{name}_fb")
    feedback.viewer = True
    feedback.nodeX = x + spacing
    feedback.nodeY = y
    feedback.par.top = f"{name}_out"

    process = base.create(process_type, f"{name}_proc")
    process.viewer = True
    process.nodeX = x + spacing * 2
    process.nodeY = y
    process.inputConnectors[0].connect(feedback)

    null_out = base.create("nullTOP", f"{name}_out")
    null_out.viewer = True
    null_out.nodeX = x + spacing * 3
    null_out.nodeY = y
    null_out.inputConnectors[0].connect(process)

    feedback.inputConnectors[0].connect(const_init)

    return {
        "feedback": feedback,
        "process": process,
        "null_out": null_out,
        "const_init": const_init,
    }


def setup_instancing(
    geo,
    instance_op_name: str,
    *,
    tx: str = "tx",
    ty: str = "ty",
    tz: str = "tz",
) -> None:
    """Configure instancing on a Geometry COMP.

    Parameters
    ----------
    geo : duck-typed Geometry COMP with ``.par``
    instance_op_name : relative name of the CHOP providing instance data
    tx, ty, tz : channel names for translate X/Y/Z
    """
    geo.par.instancing = True
    geo.par.instanceop = instance_op_name
    geo.par.instancetx = tx
    geo.par.instancety = ty
    geo.par.instancetz = tz
