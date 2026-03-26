"""Generate a Python script for exec_python_script that scans the TD operator tree.

The returned script string is meant to be executed inside the TouchDesigner
runtime via ``exec_python_script``.  It walks the operator tree starting at
*root_path*, collecting per-op metadata, extensions, custom parameters,
project shortcuts, and warnings.  The result is assigned to the ``result``
variable so that ``_process_method_result()`` auto-serializes it.
"""

from __future__ import annotations


def generate_scan_script(
    root_path: str = "/project1",
    max_depth: int = 10,
    op_limit: int = 500,
) -> str:
    """Return a Python script string that scans the TD operator tree.

    Parameters
    ----------
    root_path:
            Root operator path to start the scan from.
    max_depth:
            Maximum depth for ``findChildren``.
    op_limit:
            Hard cap on the number of operators to scan.  When the total
            children exceed this limit the scan is truncated and
            ``truncated`` is set to ``True``.
    """

    return f"""\
import inspect as _inspect

_root = op({root_path!r})
_children = _root.findChildren(maxDepth={max_depth!r})
_total_found = len(_children)
_truncated = _total_found > {op_limit!r}
if _truncated:
    _children = _children[:{op_limit!r}]

_ops = []
_extensions = {{}}
_custom_pars = {{}}
_warnings = []

for _c in _children:
    _op_info = {{
        "path": _c.path,
        "opType": _c.OPType,
        "family": _c.family,
    }}
    _ops.append(_op_info)

    # Extensions (COMPs only)
    if hasattr(_c, "extensions") and _c.family == "COMP":
        _ext_list = []
        try:
            for _ext_obj in _c.extensions:
                _ext_info = {{"name": type(_ext_obj).__name__}}
                try:
                    def _pred(m):
                        return callable(m) and not getattr(m, "__name__", "").startswith("_")
                    _members = _inspect.getmembers(_ext_obj, predicate=_pred)
                    _ext_info["methods"] = [m[0] for m in _members if not m[0].startswith("_")]
                except Exception:
                    _ext_info["methods"] = []
                _ext_list.append(_ext_info)
        except Exception as _e:
            _warnings.append(f"Extensions error on {{_c.path}}: {{_e}}")
        if _ext_list:
            _extensions[_c.path] = _ext_list

    # Custom parameters (COMPs only)
    if hasattr(_c, "customPages") and _c.family == "COMP":
        _cp_list = []
        try:
            for _page in _c.customPages:
                for _par in _page.pars:
                    _cp_list.append({{
                        "name": _par.name,
                        "label": _par.label,
                        "style": _par.style,
                    }})
        except Exception as _e:
            _warnings.append(f"CustomPars error on {{_c.path}}: {{_e}}")
        if _cp_list:
            _custom_pars[_c.path] = _cp_list

# Collect errors
for _c in _children:
    try:
        if hasattr(_c, "errors") and callable(_c.errors):
            _err = _c.errors()
            if _err:
                _warnings.append(f"{{_c.path}}: {{_err}}")
    except Exception:
        pass

# Project shortcuts
_shortcuts = {{}}
try:
    if hasattr(project, "paths"):
        for _name in dir(project.paths):
            if not _name.startswith("_"):
                try:
                    _shortcuts[_name] = getattr(project.paths, _name)
                except Exception:
                    pass
except Exception:
    pass

result = {{
    "ops": _ops,
    "extensions": _extensions,
    "customPars": _custom_pars,
    "shortcuts": _shortcuts,
    "warnings": _warnings,
    "truncated": _truncated,
    "totalFound": _total_found,
    "scanned": len(_ops),
}}
"""
