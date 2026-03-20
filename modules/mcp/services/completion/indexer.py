"""Build a Markdown index from scan data + builtin stubs.

Produces a structured Markdown document that gives the agent a compact
overview of the TD project: operator tree, extensions, custom parameters,
shortcuts, warnings, and a built-in reference to avoid hallucinated names.
"""

from __future__ import annotations

from typing import Any

from mcp.services.completion.builtin_stubs import get_builtin_stubs


def build_index(scan_data: dict[str, Any], mode: str = "compact") -> dict[str, Any]:
    """Build a Markdown index from raw scan data.

    Parameters
    ----------
    scan_data:
            Dict produced by the scan script (``generate_scan_script``).
    mode:
            ``"compact"`` (~2k tokens) or ``"full"`` (all detail).

    Returns
    -------
    Dict with keys ``markdown``, ``stats``, ``warnings``, ``truncated``.
    """

    ops: list[dict[str, str]] = scan_data.get("ops", [])
    extensions: dict[str, list[dict]] = scan_data.get("extensions", {})
    custom_pars: dict[str, list[dict]] = scan_data.get("customPars", {})
    shortcuts: dict[str, str] = scan_data.get("shortcuts", {})
    warnings: list[str] = list(scan_data.get("warnings", []))
    truncated: bool = scan_data.get("truncated", False)

    stubs = get_builtin_stubs()
    compact = mode == "compact"

    sections: list[str] = []

    # ── 1. Builtins Anti-Erreurs ────────────────────────────────────
    sections.append(_render_builtins(stubs, compact))

    # ── 2. Project Structure ────────────────────────────────────────
    sections.append(_render_project_structure(ops, truncated, scan_data, compact))

    # ── 3. Extensions ──────────────────────────────────────────────
    if extensions:
        sections.append(_render_extensions(extensions, compact))

    # ── 4. Custom Parameters ───────────────────────────────────────
    if custom_pars:
        sections.append(_render_custom_pars(custom_pars, compact))

    # ── 5. Shortcuts ───────────────────────────────────────────────
    if shortcuts:
        sections.append(_render_shortcuts(shortcuts))

    # ── 6. Warnings ────────────────────────────────────────────────
    if warnings:
        sections.append(_render_warnings(warnings, compact))

    markdown = "\n\n".join(sections)

    # Stats
    comp_count = sum(1 for o in ops if o.get("family") == "COMP")
    stats = {
        "opCount": len(ops),
        "compCount": comp_count,
        "extensionCount": len(extensions),
        "warningCount": len(warnings),
    }

    return {
        "markdown": markdown,
        "stats": stats,
        "warnings": warnings,
        "truncated": truncated,
    }


# ── Section renderers ────────────────────────────────────────────────


def _render_builtins(stubs: dict[str, Any], compact: bool) -> str:
    lines = ["# Builtins Anti-Erreurs", ""]

    # td module
    td_mod = stubs.get("td_module", [])
    lines.append("## td Module")
    if compact:
        names = [e["name"] for e in td_mod]
        lines.append(", ".join(f"`{n}`" for n in names))
    else:
        lines.extend(f"- `{e['name']}` ({e['type']}): {e['desc']}" for e in td_mod)

    lines.append("")

    # Classes
    classes = stubs.get("classes", {})
    lines.append("## Key Classes")
    if compact:
        for cls_name, cls in classes.items():
            attrs = ", ".join(f"`{a}`" for a in cls["key_attrs"][:5])
            lines.append(f"- **{cls_name}**: {attrs}")
    else:
        for cls_name, cls in classes.items():
            lines.append(f"### {cls_name}")
            lines.append(f"{cls['desc']}")
            lines.append("")
            lines.extend(f"- `{attr}`" for attr in cls["key_attrs"])
            lines.append("")

    lines.append("")

    # Common pars
    pars = stubs.get("common_pars", {})
    lines.append("## Common Parameters")
    if compact:
        for page_name, entries in pars.items():
            names = [e["name"] for e in entries]
            lines.append(f"- **{page_name}**: {', '.join(f'`{n}`' for n in names)}")
    else:
        for page_name, entries in pars.items():
            lines.append(f"### {page_name}")
            lines.extend(f"- `{e['name']}` ({e['type']}): {e['desc']}" for e in entries)
            lines.append("")

    return "\n".join(lines)


def _render_project_structure(
    ops: list[dict[str, str]],
    truncated: bool,
    scan_data: dict[str, Any],
    compact: bool,
) -> str:
    lines = ["# Project Structure", ""]

    total = scan_data.get("totalFound", len(ops))
    scanned = scan_data.get("scanned", len(ops))
    if truncated:
        lines.append(f"> Truncated: showing {scanned} of {total} operators")
        lines.append("")

    if not ops:
        lines.append("_No operators found._")
        return "\n".join(lines)

    # Table header
    lines.append("| Path | OPType | Family |")
    lines.append("|------|--------|--------|")

    display_ops = ops[:50] if compact else ops
    for op_info in display_ops:
        path = op_info.get("path", "")
        op_type = op_info.get("opType", "")
        family = op_info.get("family", "")
        lines.append(f"| `{path}` | {op_type} | {family} |")

    if compact and len(ops) > 50:
        lines.append(f"| ... | ({len(ops) - 50} more) | |")

    return "\n".join(lines)


def _render_extensions(extensions: dict[str, list[dict]], compact: bool) -> str:
    lines = ["# Extensions", ""]

    items = list(extensions.items())
    display = items[:10] if compact else items

    for comp_path, ext_list in display:
        if compact:
            names = [e.get("name", "?") for e in ext_list]
            lines.append(f"- `{comp_path}`: {', '.join(names)}")
        else:
            lines.append(f"## `{comp_path}`")
            for ext in ext_list:
                name = ext.get("name", "?")
                methods = ext.get("methods", [])
                method_str = ", ".join(f"`{m}`" for m in methods) or "(no public methods)"
                lines.append(f"- **{name}**: {method_str}")
            lines.append("")

    if compact and len(items) > 10:
        lines.append(f"- ... ({len(items) - 10} more COMPs with extensions)")

    return "\n".join(lines)


def _render_custom_pars(custom_pars: dict[str, list[dict]], compact: bool) -> str:
    lines = ["# Custom Parameters", ""]

    items = list(custom_pars.items())
    display = items[:10] if compact else items

    for comp_path, par_list in display:
        if compact:
            names = [p.get("name", "?") for p in par_list]
            lines.append(f"- `{comp_path}`: {', '.join(names)}")
        else:
            lines.append(f"## `{comp_path}`")
            for par in par_list:
                name = par.get("name", "?")
                label = par.get("label", "")
                style = par.get("style", "")
                lines.append(f"- `{name}` ({style}): {label}")
            lines.append("")

    if compact and len(items) > 10:
        lines.append(f"- ... ({len(items) - 10} more COMPs with custom parameters)")

    return "\n".join(lines)


def _render_shortcuts(shortcuts: dict[str, str]) -> str:
    lines = ["# Shortcuts", ""]
    for name, path in shortcuts.items():
        lines.append(f"- `{name}`: `{path}`")
    return "\n".join(lines)


def _render_warnings(warnings: list[str], compact: bool) -> str:
    lines = ["# Warnings", ""]
    display = warnings[:10] if compact else warnings
    lines.extend(f"- {w}" for w in display)
    if compact and len(warnings) > 10:
        lines.append(f"- ... ({len(warnings) - 10} more warnings)")
    return "\n".join(lines)
