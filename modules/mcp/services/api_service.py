"""
TouchDesigner MCP Web Server API Service Implementation
Provides API functionality related to TouchDesigner
"""

import contextlib
import difflib
import fnmatch
import importlib
import inspect
import io
import json
import os
import pydoc
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Protocol

import td
from utils.logging import log_message
from utils.result import error_result, success_result
from utils.serialization import safe_serialize
from utils.types import LogLevel, Result
from utils.version import get_mcp_api_version


class IApiService(Protocol):
    """API service interface"""

    def get_td_info(self) -> Result: ...
    def get_td_python_classes(self) -> Result: ...
    def get_td_python_class_details(self, class_name: str) -> Result: ...
    def get_module_help(self, module_name: str) -> Result: ...
    def get_node_detail(self, node_path: str) -> Result: ...
    def get_node_errors(self, node_path: str) -> Result: ...
    def update_node(self, node_path: str, properties: dict[str, Any]) -> Result: ...
    def exec_node_method(self, node_path: str, method: str, args: list, kwargs: dict) -> Result: ...
    def create_geometry_comp(
        self,
        parent_path: str,
        name: str = ...,
        x: int = ...,
        y: int = ...,
        pop: bool = ...,
    ) -> Result: ...
    def create_feedback_loop(
        self,
        parent_path: str,
        name: str = ...,
        x: int = ...,
        y: int = ...,
        process_type: str = ...,
    ) -> Result: ...
    def configure_instancing(
        self,
        geo_path: str,
        instance_op_name: str,
        tx: str = ...,
        ty: str = ...,
        tz: str = ...,
    ) -> Result: ...
    def get_dat_text(self, node_path: str) -> Result: ...
    def set_dat_text(self, node_path: str, text: str) -> Result: ...
    def lint_dat(self, node_path: str, fix: bool = ..., dry_run: bool = ...) -> Result: ...
    def format_dat(self, node_path: str, dry_run: bool = ...) -> Result: ...
    def validate_json_dat(self, node_path: str) -> Result: ...
    def validate_glsl_dat(self, node_path: str) -> Result: ...
    def discover_dat_candidates(
        self,
        parent_path: str,
        recursive: bool = ...,
        purpose: str = ...,
    ) -> Result: ...
    def lint_dats(
        self,
        parent_path: str,
        pattern: str = ...,
        purpose: str = ...,
        recursive: bool = ...,
    ) -> Result: ...
    def get_node_parameter_schema(self, node_path: str, pattern: str = ...) -> Result: ...
    def complete_op_paths(
        self, context_node_path: str, prefix: str = ..., limit: int = ...
    ) -> Result: ...
    def get_chop_channels(
        self,
        node_path: str,
        pattern: str = ...,
        include_stats: bool = ...,
        limit: int = ...,
    ) -> Result: ...
    def get_dat_table_info(
        self,
        node_path: str,
        max_preview_rows: int = ...,
        max_cell_chars: int = ...,
    ) -> Result: ...
    def get_comp_extensions(
        self,
        comp_path: str,
        include_docs: bool = ...,
        max_methods: int = ...,
    ) -> Result: ...
    def get_health(self) -> Result: ...
    def get_capabilities(self) -> Result: ...
    def typecheck_dat(self, node_path: str) -> Result: ...


class TouchDesignerApiService(IApiService):
    """Implementation of the TouchDesigner API service"""

    def get_td_info(self) -> Result:
        """Get information about the TouchDesigner server"""

        version = td.app.version
        build = td.app.build

        server_info = {
            "server": f"TouchDesigner {version}.{build}",
            "version": f"{version}.{build}",
            "osName": td.app.osName,
            "osVersion": td.app.osVersion,
            "mcpApiVersion": get_mcp_api_version(),
        }

        return success_result(server_info)

    def get_health(self) -> Result:
        """Health check: status, Python version, TD version/build."""
        import sys

        version = td.app.version
        build = td.app.build
        return success_result(
            {
                "status": "ok",
                "pythonVersion": sys.version.split()[0],
                "tdVersion": f"{version}.{build}",
                "tdBuild": str(build),
            }
        )

    def get_capabilities(self) -> Result:
        """Report available features and tool versions."""
        ruff = self._find_ruff()
        ruff_version = None
        if ruff:
            try:
                proc = subprocess.run(
                    [ruff, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                ruff_version = proc.stdout.strip() if proc.returncode == 0 else None
            except Exception:
                pass

        pyright = self._find_pyright()
        pyright_version = None
        if pyright:
            try:
                proc = subprocess.run(
                    [pyright, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                pyright_version = proc.stdout.strip() if proc.returncode == 0 else None
            except Exception:
                pass

        return success_result(
            {
                "lint_dat": ruff is not None,
                "format_dat": ruff is not None,
                "validate_glsl_dat": True,
                "typecheck_dat": pyright is not None,
                "tools": {
                    "ruff": {"installed": ruff is not None, "version": ruff_version},
                    "pyright": {
                        "installed": pyright is not None,
                        "version": pyright_version,
                    },
                },
            }
        )

    def get_td_python_classes(self) -> Result:
        """Get list of Python classes and modules available in TouchDesigner"""
        classes = []

        for name, obj in inspect.getmembers(td):
            if name.startswith("_"):
                continue

            description = inspect.getdoc(obj) or ""
            class_info = {
                "name": name,
                "description": description,
            }

            classes.append(class_info)

        return success_result({"classes": classes})

    def get_td_python_class_details(self, class_name: str) -> Result:
        """Get detailed information about a specific Python class or module"""

        obj = None
        if hasattr(td, class_name):
            obj = getattr(td, class_name)
            log_message(f"Found {class_name} in td module", LogLevel.DEBUG)
        else:
            log_message(f"Class not found: {class_name}", LogLevel.WARNING)
            return error_result(f"Class or module not found: {class_name}")

        methods = []
        properties = []

        for name, member in inspect.getmembers(obj):
            if name.startswith("_"):
                continue

            try:
                info = {
                    "name": name,
                    "description": inspect.getdoc(member) or "",
                    "type": type(member).__name__,
                }
                if (
                    inspect.isfunction(member)
                    or inspect.ismethod(member)
                    or inspect.ismethoddescriptor(member)
                ):
                    methods.append(info)
                else:
                    properties.append(info)
            except Exception as e:
                log_message(f"Error processing member {name}: {e!s}", LogLevel.WARNING)

        if inspect.isclass(obj):
            type_info = inspect.classify_class_attrs(obj)[0].kind
        else:
            type_info = type(obj).__name__

        class_details = {
            "name": class_name,
            "type": type_info,
            "description": inspect.getdoc(obj) or "",
            "methods": methods,
            "properties": properties,
        }

        return success_result(class_details)

    def get_module_help(self, module_name: str) -> Result:
        """Get Python help() output for a module or class"""

        target = self._resolve_help_target(module_name)
        if target is None:
            log_message(f"Module not found: {module_name}", LogLevel.WARNING)
            return error_result(f"Module not found: {module_name}")

        try:
            help_text = self._normalize_help_text(pydoc.render_doc(target))
        except Exception as exc:
            log_message(
                f"Error generating help for {module_name}: {exc!s}",
                LogLevel.ERROR,
            )
            return error_result(
                f"Failed to get help for {module_name}: {exc!s}",
            )

        log_message(f"Retrieved help for {module_name}", LogLevel.DEBUG)
        return success_result(
            {
                "moduleName": module_name,
                "helpText": help_text,
            }
        )

    def get_node(self, node_path: str) -> Result:
        """Alias for get_node_detail for backwards compatibility"""
        return self.get_node_detail(node_path)

    def get_node_detail(self, node_path: str) -> Result:
        """Get node at the specified path"""

        node = td.op(node_path)

        if node is None or not node.valid:
            return error_result(f"Node not found at path: {node_path}")

        node_info = self._get_node_summary(node)
        return success_result(node_info)

    def get_node_errors(self, node_path: str) -> Result:
        """Collect error messages for the specified node and its children"""

        node = td.op(node_path)

        if node is None or not node.valid:
            return error_result(f"Node not found at path: {node_path}")

        # Use TouchDesigner's built-in errors() method
        all_errors = []
        if hasattr(node, "errors") and callable(node.errors):
            try:
                # errors(recurse=True) returns a string with newline-separated error messages
                error_output = node.errors(recurse=True)
                if error_output:
                    # Parse the error output into structured data
                    error_lines = error_output.strip().split("\n")
                    for line in error_lines:
                        line = line.strip()
                        if line:
                            # Extract node path from error message if present
                            # Format: "Error message (node_path)"
                            if "(" in line and line.endswith(")"):
                                message_part, path_part = line.rsplit("(", 1)
                                error_node_path = path_part.rstrip(")")
                                message = message_part.strip()

                                # Try to get the actual node to extract more info
                                error_node = td.op(error_node_path)
                                if error_node and error_node.valid:
                                    all_errors.append(
                                        {
                                            "nodePath": error_node.path,
                                            "nodeName": error_node.name,
                                            "opType": error_node.OPType,
                                            "message": message,
                                        }
                                    )
                                else:
                                    all_errors.append(
                                        {
                                            "nodePath": error_node_path,
                                            "nodeName": "",
                                            "opType": "",
                                            "message": message,
                                        }
                                    )
                            else:
                                # Simple error message without node path
                                all_errors.append(
                                    {
                                        "nodePath": node.path,
                                        "nodeName": node.name,
                                        "opType": node.OPType,
                                        "message": line,
                                    }
                                )
            except Exception as e:
                log_message(
                    f"Error getting errors from node {node_path}: {e!s}",
                    LogLevel.WARNING,
                )

        return success_result(
            {
                "nodePath": node.path,
                "nodeName": node.name,
                "opType": node.OPType,
                "errorCount": len(all_errors),
                "hasErrors": bool(all_errors),
                "errors": all_errors,
            }
        )

    def get_nodes(
        self,
        parent_path: str,
        pattern: str | None = None,
        include_properties: bool = False,
    ) -> Result:
        """Get nodes under the specified parent path, optionally filtered by pattern

        Args:
            parent_path: Path to the parent node
            pattern: Pattern to filter nodes by name
                (e.g. "text*" for all nodes starting with "text")
            include_properties: Whether to include full node properties
                (default False for better performance)

        Returns:
            Result: Success with list of nodes or error
        """

        parent_node = td.op(parent_path)
        if parent_node is None or not parent_node.valid:
            return error_result(f"Parent node not found at path: {parent_path}")

        if pattern:
            log_message(
                f"Calling parent_node.findChildren(name='{pattern}')",
                LogLevel.DEBUG,
            )
            nodes = parent_node.findChildren(name=pattern)
        else:
            log_message("Calling parent_node.findChildren(depth=1)", LogLevel.DEBUG)
            nodes = parent_node.findChildren(depth=1)

        if include_properties:
            node_summaries = [self._get_node_summary(node) for node in nodes]
        else:
            node_summaries = [self._get_node_summary_light(node) for node in nodes]

        return success_result({"nodes": node_summaries})

    def create_node(
        self,
        parent_path: str,
        node_type: str,
        node_name: str | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> Result:
        """Create a new node under the specified parent path"""

        parent_node = td.op(parent_path)
        if parent_node is None or not parent_node.valid:
            return error_result(
                f"Parent node not found at path: {parent_path}",
            )

        new_node = parent_node.create(node_type, node_name)

        if new_node is None or not new_node.valid:
            return error_result(f"Failed to create node of type {node_type} under {parent_path}")

        if parameters and isinstance(parameters, dict):
            for prop_name, prop_value in parameters.items():
                try:
                    if hasattr(new_node.par, prop_name):
                        par = getattr(new_node.par, prop_name)
                        if hasattr(par, "val"):
                            par.val = prop_value
                    elif hasattr(new_node, prop_name):
                        prop = getattr(new_node, prop_name)
                        if isinstance(prop, (int, float, str)):
                            setattr(new_node, prop_name, prop_value)
                except Exception as e:
                    log_message(
                        f"Error setting parameter {prop_name} on new node: {e!s}",
                        LogLevel.WARNING,
                    )

        node_info = self._get_node_summary(new_node)
        return success_result({"result": node_info})

    def delete_node(self, node_path: str) -> Result:
        """Delete the node at the specified path"""

        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found at path: {node_path}")

        node_info = self._get_node_summary(node)
        node.destroy()

        if td.op(node_path) is None:
            log_message(f"Node deleted successfully: {node_path}", LogLevel.DEBUG)
            return success_result({"deleted": True, "node": node_info})
        else:
            log_message(f"Failed to verify node deletion: {node_path}", LogLevel.WARNING)
            return error_result(f"Failed to delete node: {node_path}")

    def exec_node_method(self, node_path: str, method: str, args: list, kwargs: dict) -> Result:
        """Call method on the specified node"""

        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found at path: {node_path}")

        if not hasattr(node, method):
            return error_result(f"Method {method} not found on node {node_path}")

        method = getattr(node, method)
        if not callable(method):
            return error_result(f"{method} is not a callable method")

        result = method(*args, **kwargs)

        log_message(
            f"Method: {method}, args: {args}, kwargs: {kwargs}, result: {result}",
            LogLevel.DEBUG,
        )
        log_message(
            f"Method execution complete, result type: {type(result).__name__}",
            LogLevel.DEBUG,
        )

        processed_result = self._process_method_result(result)

        return success_result({"result": processed_result})

    def exec_python_script(self, script: str) -> Result:
        """Execute a Python script directly in TouchDesigner

        Args:
            script (str): The Python script to execute

        Returns:
            Result: Success result with execution output or error result with message
        """

        no_result_sentinel = object()
        local_vars = {
            "op": td.op,
            "ops": td.ops,
            "me": td.op.me if hasattr(td, "op") and hasattr(td.op, "me") else None,
            "parent": (_p.path if hasattr(td, "op") and (_p := td.op("..")) else None),
            "project": td.project if hasattr(td, "project") else None,
            "td": td,
            "result": no_result_sentinel,
        }
        namespace = dict(globals())
        namespace.update(local_vars)

        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        with (
            contextlib.redirect_stdout(stdout_capture),
            contextlib.redirect_stderr(stderr_capture),
        ):
            if "\n" not in script and ";" not in script:
                try:
                    result = eval(script, namespace, namespace)
                    namespace["result"] = result
                    processed_result = self._process_method_result(result)

                    log_message(
                        f"Script evaluated. Raw result: {result!r}",
                        LogLevel.DEBUG,
                    )

                    stdout_val = stdout_capture.getvalue()
                    stderr_val = stderr_capture.getvalue()

                    return success_result(
                        {
                            "result": processed_result,
                            "stdout": stdout_val,
                            "stderr": stderr_val,
                        }
                    )
                except SyntaxError:
                    pass

            try:
                exec(script, namespace, namespace)

                if namespace.get("result") is no_result_sentinel:
                    lines = script.strip().split("\n")
                    if lines:
                        last_expr = lines[-1].strip()
                        if last_expr and not last_expr.startswith(
                            (
                                "import",
                                "from",
                                "#",
                                "if",
                                "def",
                                "class",
                                "for",
                                "while",
                            )
                        ):
                            try:
                                namespace["result"] = eval(last_expr, namespace, namespace)
                                log_message(
                                    f"Extracted result from last line: {last_expr}",
                                    LogLevel.DEBUG,
                                )
                            except Exception:
                                pass

                result = namespace.get("result")
                if result is no_result_sentinel:
                    result = None
                processed_result = self._process_method_result(result)

                stdout_val = stdout_capture.getvalue()
                stderr_val = stderr_capture.getvalue()

                return success_result(
                    {
                        "result": processed_result,
                        "stdout": stdout_val,
                        "stderr": stderr_val,
                    }
                )
            except Exception as exec_error:
                raise Exception(f"Script execution failed: {exec_error!s}") from exec_error

    def update_node(self, node_path: str, properties: dict[str, Any]) -> Result:
        """Update properties of the node at the specified path"""

        node = td.op(node_path)

        if node is None or not node.valid:
            return error_result(f"Node not found at path: {node_path}")

        updated_properties = []
        failed_properties = []

        for prop_name, prop_value in properties.items():
            try:
                if hasattr(node.par, prop_name):
                    par = getattr(node.par, prop_name)
                    if hasattr(par, "val"):
                        par.val = prop_value
                        updated_properties.append(prop_name)
                    else:
                        failed_properties.append(
                            {
                                "name": prop_name,
                                "reason": "Not a settable parameter",
                            }
                        )
                elif hasattr(node, prop_name):
                    prop = getattr(node, prop_name)
                    if isinstance(prop, (int, float, str)):
                        setattr(node, prop_name, prop_value)
                        updated_properties.append(prop_name)
                    else:
                        failed_properties.append(
                            {
                                "name": prop_name,
                                "reason": "Not a settable property",
                            }
                        )
                else:
                    failed_properties.append(
                        {"name": prop_name, "reason": "Property not found on node"}
                    )
            except Exception as e:
                log_message(f"Error updating property {prop_name}: {e!s}", LogLevel.ERROR)
                failed_properties.append({"name": prop_name, "reason": str(e)})

        result = {
            "path": node_path,
            "updated": updated_properties,
            "failed": failed_properties,
            "message": f"Updated {len(updated_properties)} properties",
        }

        if updated_properties:
            log_message(
                f"Successfully updated properties: {updated_properties}",
                LogLevel.DEBUG,
            )
            return success_result(result)
        else:
            log_message(
                f"No properties were updated. Failed: {failed_properties}",
                LogLevel.WARNING,
            )
            if failed_properties:
                return error_result("Failed to update any properties")
            else:
                return error_result("No matching properties to update")

    def create_geometry_comp(
        self,
        parent_path: str,
        name: str = "geo1",
        x: int = 0,
        y: int = 0,
        pop: bool = False,
    ) -> Result:
        """Create a Geometry COMP with In/Out operators"""
        parent = td.op(parent_path)
        if parent is None or not parent.valid:
            return error_result(f"Parent not found: {parent_path}")
        from td_helpers.network import setup_geometry_comp

        geo, in_op, out_op = setup_geometry_comp(parent, name, x=x, y=y, pop=pop)
        return success_result(
            {
                "geo": self._get_node_summary(geo),
                "inOp": self._get_node_summary_light(in_op),
                "outOp": self._get_node_summary_light(out_op),
            }
        )

    def create_feedback_loop(
        self,
        parent_path: str,
        name: str = "sim",
        x: int = 0,
        y: int = 0,
        process_type: str = "glslTOP",
    ) -> Result:
        """Create a Feedback TOP loop"""
        parent = td.op(parent_path)
        if parent is None or not parent.valid:
            return error_result(f"Parent not found: {parent_path}")
        from td_helpers.network import setup_feedback_loop

        ops = setup_feedback_loop(parent, name, x=x, y=y, process_type=process_type)
        return success_result({k: self._get_node_summary_light(v) for k, v in ops.items()})

    def get_dat_text(self, node_path: str) -> Result:
        """Read the .text content of a DAT operator"""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "text"):
            return error_result(f"Node has no .text attribute: {node_path}")
        return success_result({"path": node.path, "name": node.name, "text": node.text})

    def set_dat_text(self, node_path: str, text: str) -> Result:
        """Write .text content to a DAT operator"""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "text"):
            return error_result(f"Node has no .text attribute: {node_path}")
        node.text = text
        return success_result({"path": node.path, "name": node.name, "length": len(text)})

    @staticmethod
    def _parse_ruff_diagnostics(raw: list) -> list[dict]:
        """Parse raw ruff JSON diagnostics into structured dicts."""
        return [
            {
                "code": d.get("code"),
                "message": d.get("message", ""),
                "line": d.get("location", {}).get("row"),
                "column": d.get("location", {}).get("column"),
                "endLine": d.get("end_location", {}).get("row"),
                "endColumn": d.get("end_location", {}).get("column"),
                "fixable": d.get("fix") is not None,
            }
            for d in raw
        ]

    def lint_dat(self, node_path: str, fix: bool = False, dry_run: bool = False) -> Result:
        """Lint the .text content of a DAT operator using ruff"""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "text"):
            return error_result(f"Node has no .text attribute: {node_path}")

        ruff = self._find_ruff()
        if ruff is None:
            return error_result(
                "ruff not found. Install it with 'uv add ruff' or ensure it is on PATH."
            )

        code = node.text
        project_root = Path(__file__).resolve().parents[3]

        fd, tmp_path = tempfile.mkstemp(suffix=".py")
        try:
            os.write(fd, code.encode("utf-8"))
            os.close(fd)
            fd = -1  # mark as already closed

            cmd = [ruff, "check", "--output-format", "json"]
            if fix:
                cmd.append("--fix")
            cmd.append(tmp_path)

            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    cwd=str(project_root),
                    timeout=30,
                )
            except subprocess.TimeoutExpired:
                return error_result("ruff timed out after 30s")

            if proc.returncode >= 2 or (proc.returncode == 1 and not proc.stdout.strip()):
                stderr_msg = proc.stderr.strip() if proc.stderr else "unknown error"
                return error_result(f"ruff failed (exit {proc.returncode}): {stderr_msg}")

            try:
                raw_diagnostics = json.loads(proc.stdout) if proc.stdout.strip() else []
            except json.JSONDecodeError:
                return error_result(f"ruff returned invalid JSON: {proc.stdout[:200]}")

            diagnostics = self._parse_ruff_diagnostics(raw_diagnostics)

            result_data: dict[str, Any] = {
                "path": node.path,
                "name": node.name,
                "diagnosticCount": len(diagnostics),
                "diagnostics": diagnostics,
            }

            if fix:
                with open(tmp_path, encoding="utf-8") as f:
                    fixed_code = f.read()
                if fixed_code != code:
                    # Re-lint the fixed code to find remaining issues
                    relint_cmd = [ruff, "check", "--output-format", "json", tmp_path]
                    try:
                        relint_proc = subprocess.run(
                            relint_cmd,
                            capture_output=True,
                            text=True,
                            cwd=str(project_root),
                            timeout=30,
                        )
                        relint_raw = (
                            json.loads(relint_proc.stdout) if relint_proc.stdout.strip() else []
                        )
                    except (subprocess.TimeoutExpired, json.JSONDecodeError):
                        relint_raw = []
                    remaining = self._parse_ruff_diagnostics(relint_raw)
                    result_data["remainingDiagnostics"] = remaining
                    result_data["remainingDiagnosticCount"] = len(remaining)

                    if dry_run:
                        diff_lines = list(
                            difflib.unified_diff(
                                code.splitlines(keepends=True),
                                fixed_code.splitlines(keepends=True),
                                fromfile=f"{node.path} (original)",
                                tofile=f"{node.path} (fixed)",
                            )
                        )
                        result_data["diff"] = "".join(diff_lines)
                        result_data["applied"] = False
                    else:
                        node.text = fixed_code
                        result_data["applied"] = True
                    result_data["fixed"] = True
                    result_data["fixedText"] = fixed_code
                else:
                    result_data["fixed"] = False
                    result_data["remainingDiagnostics"] = []
                    result_data["remainingDiagnosticCount"] = 0
                    result_data["applied"] = False

            return success_result(result_data)

        finally:
            if fd >= 0:
                os.close(fd)
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)

    def format_dat(self, node_path: str, dry_run: bool = False) -> Result:
        """Format the .text content of a DAT operator using ruff format"""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "text"):
            return error_result(f"Node has no .text attribute: {node_path}")

        ruff = self._find_ruff()
        if ruff is None:
            return error_result(
                "ruff not found. Install it with 'uv add ruff' or ensure it is on PATH."
            )

        code = node.text
        project_root = Path(__file__).resolve().parents[3]

        fd, tmp_path = tempfile.mkstemp(suffix=".py")
        try:
            os.write(fd, code.encode("utf-8"))
            os.close(fd)
            fd = -1  # mark as already closed

            cmd = [ruff, "format", tmp_path]

            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    cwd=str(project_root),
                    timeout=30,
                )
            except subprocess.TimeoutExpired:
                return error_result("ruff format timed out after 30s")

            if proc.returncode >= 2:
                stderr_msg = proc.stderr.strip() if proc.stderr else "unknown error"
                return error_result(f"ruff format failed (exit {proc.returncode}): {stderr_msg}")

            with open(tmp_path, encoding="utf-8") as f:
                formatted_code = f.read()

            changed = formatted_code != code

            diff_text = ""
            if changed:
                diff_lines = list(
                    difflib.unified_diff(
                        code.splitlines(keepends=True),
                        formatted_code.splitlines(keepends=True),
                        fromfile=f"{node.path} (original)",
                        tofile=f"{node.path} (formatted)",
                    )
                )
                diff_text = "".join(diff_lines)

            applied = False
            if changed and not dry_run:
                node.text = formatted_code
                applied = True

            return success_result(
                {
                    "path": node.path,
                    "name": node.name,
                    "originalText": code,
                    "formattedText": formatted_code,
                    "changed": changed,
                    "diff": diff_text,
                    "applied": applied,
                }
            )

        finally:
            if fd >= 0:
                os.close(fd)
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)

    def validate_json_dat(self, node_path: str) -> Result:
        """Validate JSON or YAML content in a DAT operator.

        Auto-detects format: tries JSON first, then YAML (if available).
        Returns structured diagnostics with line/column positions.
        """
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "text"):
            return error_result(f"Node has no .text attribute: {node_path}")

        text = node.text
        if not text.strip():
            return success_result(
                {
                    "path": node.path,
                    "name": node.name,
                    "format": "unknown",
                    "valid": True,
                    "diagnostics": [],
                }
            )

        # Try JSON first
        json_error = None
        try:
            json.loads(text)
            return success_result(
                {
                    "path": node.path,
                    "name": node.name,
                    "format": "json",
                    "valid": True,
                    "diagnostics": [],
                }
            )
        except json.JSONDecodeError as e:
            json_error = {
                "line": e.lineno,
                "column": e.colno,
                "message": e.msg,
            }

        # Try YAML if available
        yaml_error = None
        yaml_available = False
        try:
            import yaml

            yaml_available = True
            yaml.safe_load(text)
            return success_result(
                {
                    "path": node.path,
                    "name": node.name,
                    "format": "yaml",
                    "valid": True,
                    "diagnostics": [],
                }
            )
        except ImportError:
            pass
        except Exception as e:
            if yaml_available:
                line = 1
                column = 1
                msg = str(e)
                # yaml.YAMLError subclasses may have problem_mark
                mark = getattr(e, "problem_mark", None)
                if mark is not None:
                    line = getattr(mark, "line", 0) + 1  # 0-based to 1-based
                    column = getattr(mark, "column", 0) + 1
                problem = getattr(e, "problem", None)
                if problem:
                    msg = str(problem)
                yaml_error = {
                    "line": line,
                    "column": column,
                    "message": msg,
                }

        # Both failed (or only JSON tried)
        diagnostics: list[dict[str, object]] = []
        if json_error is not None:
            diagnostics.append(json_error)
        if yaml_error is not None:
            diagnostics.append(yaml_error)

        detected_format = "unknown"
        if json_error is not None and yaml_error is None and not yaml_available:
            detected_format = "json"

        return success_result(
            {
                "path": node.path,
                "name": node.name,
                "format": detected_format,
                "valid": False,
                "diagnostics": diagnostics,
            }
        )

    def validate_glsl_dat(self, node_path: str) -> Result:
        """Validate GLSL shader code in a DAT operator.

        Strategy:
        1. Determine shader type from DAT name suffix (_pixel, _vertex, _compute).
        2. Try to find a connected GLSL TOP/MAT in the same parent and check its errors().
        3. Fall back to glslangValidator if available on PATH.
        4. Return structured diagnostics.
        """
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "text"):
            return error_result(f"Node has no .text attribute: {node_path}")

        text = getattr(node, "text", "") or ""
        name = getattr(node, "name", "")
        path = getattr(node, "path", node_path)

        # Determine shader type from name suffix
        shader_type = "unknown"
        if name.endswith("_pixel"):
            shader_type = "pixel"
        elif name.endswith("_vertex"):
            shader_type = "vertex"
        elif name.endswith("_compute"):
            shader_type = "compute"

        # Strategy 1: Find connected GLSL TOP/MAT and check its errors
        td_errors_diagnostics = self._check_glsl_td_errors(node)
        if td_errors_diagnostics is not None:
            diagnostics, valid = td_errors_diagnostics
            return success_result(
                {
                    "path": path,
                    "name": name,
                    "shaderType": shader_type,
                    "valid": valid,
                    "diagnostics": diagnostics,
                    "validationMethod": "td_errors",
                }
            )

        # Strategy 2: Fall back to glslangValidator
        validator_path = shutil.which("glslangValidator")
        if validator_path is not None and text.strip():
            diagnostics, valid = self._run_glslang_validator(text, shader_type, validator_path)
            return success_result(
                {
                    "path": path,
                    "name": name,
                    "shaderType": shader_type,
                    "valid": valid,
                    "diagnostics": diagnostics,
                    "validationMethod": "glslangValidator",
                }
            )

        # No validation method available
        return success_result(
            {
                "path": path,
                "name": name,
                "shaderType": shader_type,
                "valid": True,
                "diagnostics": [],
                "validationMethod": "none",
            }
        )

    def _check_glsl_td_errors(self, dat_node: Any) -> tuple[list[dict[str, object]], bool] | None:
        """Check for GLSL errors via connected GLSL TOP/MAT in the same parent.

        Returns (diagnostics, valid) or None if no GLSL operator found.
        """
        parent_attr = getattr(dat_node, "parent", None)
        parent = parent_attr() if parent_attr is not None and callable(parent_attr) else None
        if parent is None:
            return None

        children = getattr(parent, "children", None)
        if children is None:
            return None

        dat_name = getattr(dat_node, "name", "")
        glsl_op_types = ("glslTOP", "glslmultiTOP", "glslMAT")
        glsl_op = None

        for child in children:
            op_type = getattr(child, "OPType", "")
            if op_type not in glsl_op_types:
                continue
            # Check if this GLSL operator references our DAT
            # by looking at its parameters (dat, glsldat, pixeldat, vertexdat, etc.)
            for par_name in ("dat", "glsldat", "pixeldat", "vertexdat", "computedat"):
                par = getattr(child.par, par_name, None) if hasattr(child, "par") else None
                if par is not None:
                    par_val = getattr(par, "eval", lambda: None)()
                    if par_val is not None:
                        ref_path = getattr(par_val, "path", str(par_val))
                        if ref_path == getattr(dat_node, "path", ""):
                            glsl_op = child
                            break
                        # Also check by name reference
                        ref_name = getattr(par_val, "name", str(par_val))
                        if ref_name == dat_name:
                            glsl_op = child
                            break
            if glsl_op is not None:
                break

        if glsl_op is None:
            return None

        # Get errors from the GLSL operator
        diagnostics: list[dict[str, object]] = []
        error_output: str = ""
        errors_fn = getattr(glsl_op, "errors", None)
        if errors_fn is not None and callable(errors_fn):
            with contextlib.suppress(Exception):
                error_output = str(errors_fn() or "")

        if not error_output:
            return ([], True)

        # Parse error lines into diagnostics
        for line in error_output.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            diag: dict[str, object] = self._parse_glsl_error_line(line)
            diagnostics.append(diag)

        return (diagnostics, len(diagnostics) == 0)

    @staticmethod
    def _parse_glsl_error_line(line: str) -> dict[str, object]:
        """Parse a GLSL error line into structured diagnostic.

        Common formats:
        - 'ERROR: 0:5: ...' (glsl compiler)
        - Plain text error message
        """
        import re

        # Try to match 'ERROR: <file>:<line>: <message>' or 'WARNING: <file>:<line>: <message>'
        m = re.match(r"(ERROR|WARNING|INFO):\s*\d+:(\d+):\s*(.*)", line)
        if m:
            severity = m.group(1).lower()
            line_num = int(m.group(2))
            message = m.group(3)
            return {
                "line": line_num,
                "column": 1,
                "message": message,
                "severity": severity,
            }

        # Fallback: treat as error with no line info
        return {
            "line": 1,
            "column": 1,
            "message": line,
            "severity": "error",
        }

    def _run_glslang_validator(
        self, text: str, shader_type: str, validator_path: str
    ) -> tuple[list[dict[str, object]], bool]:
        """Run glslangValidator on shader text. Returns (diagnostics, valid)."""
        # Map shader type to file extension
        ext_map = {
            "pixel": ".frag",
            "vertex": ".vert",
            "compute": ".comp",
            "unknown": ".frag",  # default to fragment
        }
        ext = ext_map.get(shader_type, ".frag")

        fd = -1
        tmp_path = ""
        try:
            fd, tmp_path = tempfile.mkstemp(suffix=ext, prefix="glsl_validate_")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(text)
            fd = -1  # fd is closed by os.fdopen

            proc = subprocess.run(
                [validator_path, tmp_path],
                capture_output=True,
                text=True,
                timeout=30,
            )

            diagnostics: list[dict[str, object]] = []
            output = (proc.stdout or "") + (proc.stderr or "")
            for line in output.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                if line.startswith(("ERROR:", "WARNING:")):
                    diag = self._parse_glsl_error_line(line)
                    diagnostics.append(diag)

            valid = proc.returncode == 0
            return (diagnostics, valid)

        except subprocess.TimeoutExpired:
            return (
                [
                    {
                        "line": 1,
                        "column": 1,
                        "message": "glslangValidator timed out",
                        "severity": "error",
                    }
                ],
                False,
            )
        except Exception as exc:
            return (
                [
                    {
                        "line": 1,
                        "column": 1,
                        "message": f"glslangValidator error: {exc!s}",
                        "severity": "error",
                    }
                ],
                False,
            )
        finally:
            if fd >= 0:
                os.close(fd)
            with contextlib.suppress(OSError):
                if tmp_path:
                    os.unlink(tmp_path)

    @staticmethod
    def _safe_par_value(par, mode: str = "eval"):
        """Safely read a par's current or default value.

        Returns the value as a JSON-friendly type (converts td.OP → path str).
        """
        try:
            val = par.eval() if mode == "eval" else par.default
            if hasattr(td, "OP") and isinstance(val, td.OP):
                return val.path
            return val
        except Exception:
            return None

    def get_node_parameter_schema(self, node_path: str, pattern: str = "*") -> Result:
        """Return parameter schema metadata for a node."""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")

        import fnmatch as _fnmatch

        parameters = []
        for par in node.pars(pattern):
            if not _fnmatch.fnmatch(par.name, pattern):
                continue
            parameters.append(
                {
                    "name": par.name,
                    "label": getattr(par, "label", par.name),
                    "style": getattr(par, "style", ""),
                    "default": self._safe_par_value(par, "default"),
                    "val": self._safe_par_value(par, "eval"),
                    "min": getattr(par, "min", None),
                    "max": getattr(par, "max", None),
                    "clampMin": getattr(par, "clampMin", False),
                    "clampMax": getattr(par, "clampMax", False),
                    "menuNames": list(getattr(par, "menuNames", ())),
                    "menuLabels": list(getattr(par, "menuLabels", ())),
                    "isOP": getattr(par, "isOP", False),
                    "readOnly": getattr(par, "readOnly", False),
                    "page": getattr(par, "page", ""),
                }
            )

        return success_result(
            {
                "nodePath": node.path,
                "opType": node.OPType,
                "count": len(parameters),
                "parameters": parameters,
            }
        )

    def complete_op_paths(
        self, context_node_path: str, prefix: str = "*", limit: int = 50
    ) -> Result:
        """Resolve op('...') style paths from a context node."""
        context = td.op(context_node_path)
        if context is None or not context.valid:
            return error_result(f"Context node not found: {context_node_path}")

        import fnmatch as _fnmatch

        matches = []
        note = None

        def _collect(search_node, name_pattern, rel_prefix=""):
            """Find children matching name_pattern under search_node."""
            if search_node is None or not search_node.valid:
                return
            children = search_node.findChildren(name="*", depth=1)
            for child in children:
                if _fnmatch.fnmatch(child.name, name_pattern):
                    rel_ref = f"{rel_prefix}{child.name}" if rel_prefix else child.name
                    matches.append(
                        {
                            "path": child.path,
                            "name": child.name,
                            "opType": child.OPType,
                            "family": getattr(child, "family", ""),
                            "relativeRef": rel_ref,
                        }
                    )

        if prefix.startswith("/"):
            # Absolute path
            parts = prefix.rstrip("/").rsplit("/", 1)
            if len(parts) == 2:
                parent_path, last_seg = parts
                parent_path = parent_path or "/"
                parent_node = td.op(parent_path)
                if parent_node is None or not parent_node.valid:
                    return error_result(f"Parent not found: {parent_path}")
                name_pat = f"{last_seg}*" if "*" not in last_seg else last_seg
                _collect(parent_node, name_pat, f"{parent_path}/")
            else:
                # Single segment like "/project1"
                exact = td.op(prefix)
                if exact is not None and exact.valid:
                    matches.append(
                        {
                            "path": exact.path,
                            "name": exact.name,
                            "opType": exact.OPType,
                            "family": getattr(exact, "family", ""),
                            "relativeRef": prefix,
                        }
                    )
        elif prefix.startswith("./"):
            # Child of context
            remainder = prefix[2:]
            is_comp = hasattr(context, "children")
            search_node = context if is_comp else context.parent()
            if not is_comp:
                note = "context is not a COMP, searched siblings instead"
            if "/" in remainder:
                # Multi-level: ./sub/foo
                segments = remainder.split("/")
                for seg in segments[:-1]:
                    if search_node is None:
                        break
                    found = None
                    for child in search_node.findChildren(name=seg, depth=1):
                        if child.name == seg:
                            found = child
                            break
                    search_node = found
                last_seg = segments[-1]
            else:
                last_seg = remainder
            name_pat = f"{last_seg}*" if last_seg and "*" not in last_seg else (last_seg or "*")
            _collect(search_node, name_pat, "./")
        elif prefix.startswith("../"):
            # Sibling of parent
            remainder = prefix[3:]
            parent = context.parent()
            if parent is not None:
                grandparent = parent.parent()
                search_node = grandparent
            else:
                search_node = None
            name_pat = f"{remainder}*" if remainder and "*" not in remainder else (remainder or "*")
            _collect(search_node, name_pat, "../")
        elif "/" in prefix:
            # Relative multi-level: sub/foo
            segments = prefix.split("/")
            search_node = context.parent()
            for seg in segments[:-1]:
                if search_node is None:
                    break
                found = None
                for child in search_node.findChildren(name=seg, depth=1):
                    if child.name == seg:
                        found = child
                        break
                search_node = found
            last_seg = segments[-1]
            name_pat = f"{last_seg}*" if "*" not in last_seg else last_seg
            rel_prefix = "/".join(segments[:-1]) + "/"
            _collect(search_node, name_pat, rel_prefix)
        else:
            # Simple name — search siblings and children
            name_pat = f"{prefix}*" if prefix != "*" and "*" not in prefix else prefix
            parent = context.parent()
            if parent is not None:
                _collect(parent, name_pat)

        truncated = len(matches) > limit
        matches = matches[:limit]

        result_data: dict = {
            "contextNodePath": context.path,
            "prefix": prefix,
            "count": len(matches),
            "truncated": truncated,
            "matches": matches,
        }
        if note:
            result_data["note"] = note

        return success_result(result_data)

    def get_chop_channels(
        self,
        node_path: str,
        pattern: str = "*",
        include_stats: bool = False,
        limit: int = 100,
    ) -> Result:
        """Return channel info for a CHOP node."""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "numChans"):
            return error_result(f"Not a CHOP: {node_path}")

        import fnmatch as _fnmatch

        channels = []
        for i in range(node.numChans):
            ch = node.chan(i)
            if ch is None:
                continue
            if not _fnmatch.fnmatch(ch.name, pattern):
                continue
            entry: dict = {"name": ch.name}
            if include_stats:
                vals = ch.vals
                entry["minVal"] = min(vals) if vals else 0.0
                entry["maxVal"] = max(vals) if vals else 0.0
                entry["avgVal"] = sum(vals) / len(vals) if vals else 0.0
            channels.append(entry)

        truncated = len(channels) > limit
        channels = channels[:limit]

        return success_result(
            {
                "nodePath": node.path,
                "numChannels": node.numChans,
                "numSamples": getattr(node, "numSamples", 0),
                "sampleRate": getattr(node, "sampleRate", 0),
                "channels": channels,
                "truncated": truncated,
            }
        )

    def get_dat_table_info(
        self,
        node_path: str,
        max_preview_rows: int = 6,
        max_cell_chars: int = 200,
    ) -> Result:
        """Return dimensions and a sample of a table DAT's content."""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "numRows"):
            return error_result(f"Not a table DAT: {node_path}")

        num_rows = node.numRows
        num_cols = node.numCols
        max_cols = 50

        sample_data = []
        truncated_cells = False
        rows_to_read = min(num_rows, max_preview_rows)
        cols_to_read = min(num_cols, max_cols)

        for r in range(rows_to_read):
            row = []
            for c in range(cols_to_read):
                cell = node[r, c]
                val = str(cell.val) if cell is not None else ""
                if len(val) > max_cell_chars:
                    val = val[:max_cell_chars] + "..."
                    truncated_cells = True
                row.append(val)
            sample_data.append(row)

        return success_result(
            {
                "nodePath": node.path,
                "numRows": num_rows,
                "numCols": num_cols,
                "sampleData": sample_data,
                "truncatedRows": num_rows > max_preview_rows,
                "truncatedCols": num_cols > max_cols,
                "truncatedCells": truncated_cells,
            }
        )

    def get_comp_extensions(
        self,
        comp_path: str,
        include_docs: bool = False,
        max_methods: int = 50,
    ) -> Result:
        """Return extension info for a COMP."""
        comp = td.op(comp_path)
        if comp is None or not comp.valid:
            return error_result(f"Node not found: {comp_path}")
        if not hasattr(comp, "extensions"):
            return error_result(f"Not a COMP or no extensions: {comp_path}")

        extensions_list = []
        for ext in comp.extensions:
            ext_name = type(ext).__name__
            methods = []
            properties = []

            members = inspect.getmembers(ext)
            method_count = 0
            for member_name, member_obj in members:
                if member_name.startswith("_"):
                    continue
                if callable(member_obj):
                    method_count += 1
                    if len(methods) < max_methods:
                        entry: dict = {"name": member_name}
                        try:
                            entry["signature"] = str(inspect.signature(member_obj))
                        except (ValueError, TypeError):
                            entry["signature"] = "(...)"
                        if include_docs:
                            doc = inspect.getdoc(member_obj) or ""
                            entry["doc"] = doc[:500] if len(doc) > 500 else doc
                        methods.append(entry)
                else:
                    properties.append({"name": member_name, "type": type(member_obj).__name__})

            extensions_list.append(
                {
                    "name": ext_name,
                    "methodCount": method_count,
                    "propertyCount": len(properties),
                    "methods": methods,
                    "properties": properties,
                }
            )

        return success_result(
            {
                "compPath": comp.path,
                "extensions": extensions_list,
            }
        )

    def _find_text_dats(
        self,
        parent_path: str,
        pattern: str = "*",
        recursive: bool = False,
    ) -> list[Any] | None:
        """Return DAT nodes with .text under parent, or None if parent invalid."""
        parent = td.op(parent_path)
        if parent is None or not parent.valid:
            return None
        depth = None if recursive else 1
        children = parent.findChildren(name=pattern, depth=depth)
        return [n for n in children if hasattr(n, "text")]

    _GLSL_MARKERS = ("uniform ", "layout(", "in vec", "out vec")
    _PYTHON_MARKERS = ("import ", "def ", "class ", "op(", "me.", "parent()", "ext.")

    def _classify_dat_kind(self, node: Any) -> tuple[str, str, str]:
        """Classify a DAT node into (kindGuess, confidence, why)."""
        op_type = getattr(node, "OPType", "")

        # 1. By opType (most reliable signal)
        if op_type == "scriptDAT":
            return ("python", "high", "scriptDAT operator")
        if op_type == "cplusplusDAT":
            return ("text", "high", "C++ DAT")
        if op_type in ("tableDAT", "jsonDAT", "xmlDAT"):
            return ("data", "high", f"{op_type} operator")

        # 2. By docking context (for textDAT)
        name = getattr(node, "name", "")
        if name.endswith(("_pixel", "_vertex", "_compute")):
            suffix = name.rsplit("_", 1)[-1]
            return ("glsl", "high", f"docked shader DAT (name ends with _{suffix})")

        # 3. By content analysis (for textDAT without structural signal)
        text = getattr(node, "text", "") or ""
        if not text.strip():
            return ("empty", "high", "no content")

        # GLSL detection
        if "#version" in text or "void main(" in text:
            return ("glsl", "high", "GLSL keywords (#version or void main)")
        glsl_count = sum(1 for m in self._GLSL_MARKERS if m in text)
        if glsl_count >= 2:
            return ("glsl", "medium", f"GLSL markers ({glsl_count} found)")

        # Python detection
        py_count = sum(1 for m in self._PYTHON_MARKERS if m in text)
        if py_count >= 3:
            return ("python", "high", f"Python markers ({py_count} found)")
        if py_count >= 2:
            return ("python", "medium", f"Python markers ({py_count} found)")
        if py_count >= 1:
            return ("python", "low", f"Python markers ({py_count} found)")

        return ("text", "low", "no recognizable pattern")

    def discover_dat_candidates(
        self,
        parent_path: str,
        recursive: bool = False,
        purpose: str = "any",
    ) -> Result:
        """Discover DAT candidates under parent, classified by kind."""
        valid_purposes = ("python", "glsl", "text", "data", "any")
        if purpose not in valid_purposes:
            return error_result(f"Invalid purpose: {purpose}. Use python|glsl|text|data|any")

        text_dats = self._find_text_dats(parent_path, recursive=recursive)
        if text_dats is None:
            return error_result(f"Parent not found: {parent_path}")

        candidates = []
        for dat in text_dats:
            kind, confidence, why = self._classify_dat_kind(dat)
            if purpose != "any" and kind != purpose:
                continue
            if kind == "empty":
                continue
            text = getattr(dat, "text", "") or ""
            parent_op = dat.parent() if hasattr(dat, "parent") and callable(dat.parent) else None
            parent_path_str: str = getattr(parent_op, "path", "") if parent_op else ""
            candidates.append(
                {
                    "path": dat.path,
                    "name": dat.name,
                    "opType": dat.OPType,
                    "kindGuess": kind,
                    "confidence": confidence,
                    "why": why,
                    "lineCount": text.count("\n") + 1 if text else 0,
                    "parentComp": parent_path_str,
                    "isDocked": bool(getattr(dat, "dock", None)),
                }
            )

        order = {"high": 0, "medium": 1, "low": 2}
        candidates.sort(key=lambda c: (order.get(c["confidence"], 3), c["name"]))

        return success_result(
            {
                "parentPath": parent_path,
                "purpose": purpose,
                "count": len(candidates),
                "candidates": candidates,
            }
        )

    def lint_dats(
        self,
        parent_path: str,
        pattern: str = "*",
        purpose: str = "python",
        recursive: bool = False,
    ) -> Result:
        """Batch-lint DAT operators under a parent path.

        Calls discover_dat_candidates then lint_dat on each result.
        Returns per-DAT breakdown and summary counters.
        """
        discover_result = self.discover_dat_candidates(
            parent_path, recursive=recursive, purpose=purpose
        )
        if not discover_result.get("success"):
            return discover_result

        candidates = discover_result.get("data", {}).get("candidates", [])

        # Apply name pattern filter
        if pattern and pattern != "*":
            candidates = [c for c in candidates if fnmatch.fnmatch(c["name"], pattern)]

        results: list[dict[str, Any]] = []
        total_issues = 0
        fixable_count = 0
        dats_with_errors = 0
        by_severity: dict[str, int] = {"error": 0, "warning": 0, "info": 0}

        for candidate in candidates:
            lint_result = self.lint_dat(candidate["path"])
            if not lint_result.get("success"):
                # Record the failure but continue
                results.append(
                    {
                        "path": candidate["path"],
                        "name": candidate["name"],
                        "diagnosticCount": 0,
                        "diagnostics": [],
                        "error": lint_result.get("error", "lint failed"),
                    }
                )
                continue

            lint_data = lint_result.get("data", {})
            diag_count = lint_data.get("diagnosticCount", 0)
            diagnostics = lint_data.get("diagnostics", [])

            results.append(
                {
                    "path": lint_data.get("path", candidate["path"]),
                    "name": lint_data.get("name", candidate["name"]),
                    "diagnosticCount": diag_count,
                    "diagnostics": diagnostics,
                }
            )

            total_issues += diag_count
            if diag_count > 0:
                dats_with_errors += 1

            for d in diagnostics:
                if d.get("fixable"):
                    fixable_count += 1
                code = d.get("code") or ""
                first_char = code[0].upper() if code else ""
                if first_char == "E":
                    by_severity["error"] += 1
                elif first_char == "W":
                    by_severity["warning"] += 1
                else:
                    by_severity["info"] += 1

        total_scanned = len(results)
        dats_clean = total_scanned - dats_with_errors
        manual_count = total_issues - fixable_count

        # Worst offenders: top 5 DATs sorted by issue count desc
        worst_offenders = sorted(
            [r for r in results if r["diagnosticCount"] > 0],
            key=lambda r: r["diagnosticCount"],
            reverse=True,
        )[:5]
        worst_offenders_summary = [
            {
                "path": r["path"],
                "name": r["name"],
                "diagnosticCount": r["diagnosticCount"],
            }
            for r in worst_offenders
        ]

        return success_result(
            {
                "parentPath": parent_path,
                "summary": {
                    "totalDatsScanned": total_scanned,
                    "datsWithErrors": dats_with_errors,
                    "datsClean": dats_clean,
                    "totalIssues": total_issues,
                    "fixableCount": fixable_count,
                    "manualCount": manual_count,
                    "bySeverity": by_severity,
                    "worstOffenders": worst_offenders_summary,
                },
                "results": results,
            }
        )

    def _find_ruff(self) -> str | None:
        """Locate the ruff binary on PATH or in the project .venv."""
        found = shutil.which("ruff")
        if found:
            return found

        project_root = Path(__file__).resolve().parents[3]
        if os.name == "nt":
            candidate = project_root / ".venv" / "Scripts" / "ruff.exe"
        else:
            candidate = project_root / ".venv" / "bin" / "ruff"

        if candidate.is_file():
            return str(candidate)

        return None

    def _find_pyright(self) -> str | None:
        """Locate the pyright executable (or pyright-python wrapper)."""
        project_root = Path(__file__).resolve().parents[3]
        venv_bin = project_root / ".venv" / ("Scripts" if os.name == "nt" else "bin")
        candidates = [venv_bin / "pyright", venv_bin / "pyright.exe"]
        for c in candidates:
            if c.is_file():
                return str(c)
        return shutil.which("pyright")

    @staticmethod
    def _parse_pyright_diagnostics(output: dict) -> list[dict]:
        """Parse pyright --outputjson output into a flat diagnostic list."""
        diagnostics: list[dict] = []
        for diag in output.get("generalDiagnostics", []):
            rng = diag.get("range", {})
            start = rng.get("start", {})
            diagnostics.append(
                {
                    "severity": diag.get("severity", "error"),
                    "message": diag.get("message", ""),
                    "line": start.get("line", 0),
                    "column": start.get("character", 0),
                    "rule": diag.get("rule", ""),
                }
            )
        return diagnostics

    def typecheck_dat(self, node_path: str) -> Result:
        """Typecheck the .text content of a DAT operator using pyright."""
        node = td.op(node_path)
        if node is None or not node.valid:
            return error_result(f"Node not found: {node_path}")
        if not hasattr(node, "text"):
            return error_result(f"Node has no .text attribute: {node_path}")

        pyright = self._find_pyright()
        if pyright is None:
            return error_result(
                "pyright not found. Install it with 'uv add pyright' or ensure it is on PATH."
            )

        code = node.text
        project_root = Path(__file__).resolve().parents[3]
        stubs_dir = project_root / "modules"  # td.pyi lives here

        fd, tmp_path = tempfile.mkstemp(suffix=".py")
        try:
            os.write(fd, code.encode("utf-8"))
            os.close(fd)
            fd = -1

            # Write a temp pyrightconfig.json so pyright resolves import td via stubs
            tmp_dir = Path(tmp_path).parent
            pyright_config = tmp_dir / "pyrightconfig.json"
            wrote_config = False
            if not pyright_config.exists():
                pyright_config.write_text(
                    json.dumps(
                        {
                            "pythonVersion": "3.11",
                            "extraPaths": [str(stubs_dir)],
                            "typeCheckingMode": "basic",
                        }
                    )
                )
                wrote_config = True

            cmd = [pyright, "--outputjson", tmp_path]

            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    cwd=str(tmp_dir),
                    timeout=60,
                )
            except subprocess.TimeoutExpired:
                return error_result("pyright timed out after 60s")
            finally:
                if wrote_config:
                    with contextlib.suppress(OSError):
                        pyright_config.unlink()

            # pyright exit codes: 0=clean, 1=diagnostics, 2+=fatal
            if proc.returncode >= 2:
                stderr_msg = proc.stderr.strip() if proc.stderr else "unknown error"
                return error_result(f"pyright failed (exit {proc.returncode}): {stderr_msg}")

            try:
                output = json.loads(proc.stdout) if proc.stdout.strip() else {}
            except json.JSONDecodeError:
                return error_result(f"pyright returned invalid JSON: {proc.stdout[:200]}")

            diagnostics = self._parse_pyright_diagnostics(output)

            return success_result(
                {
                    "path": node.path,
                    "name": node.name,
                    "diagnosticCount": len(diagnostics),
                    "diagnostics": diagnostics,
                }
            )
        finally:
            if fd >= 0:
                os.close(fd)
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)

    def configure_instancing(
        self,
        geo_path: str,
        instance_op_name: str,
        tx: str = "tx",
        ty: str = "ty",
        tz: str = "tz",
    ) -> Result:
        """Configure instancing on a Geometry COMP"""
        geo = td.op(geo_path)
        if geo is None or not geo.valid:
            return error_result(f"Geo not found: {geo_path}")
        from td_helpers.network import setup_instancing

        setup_instancing(geo, instance_op_name, tx=tx, ty=ty, tz=tz)
        return success_result(
            {
                "geo": self._get_node_summary_light(geo),
                "instanceOp": instance_op_name,
                "tx": tx,
                "ty": ty,
                "tz": tz,
            }
        )

    def _get_node_properties(self, node):
        params_dict = {}
        for par in node.pars("*"):
            try:
                value = par.eval()
                if isinstance(value, td.OP):
                    value = value.path
                params_dict[par.name] = value
            except Exception as e:
                log_message(f"Error evaluating parameter {par.name}: {e!s}", LogLevel.DEBUG)
                params_dict[par.name] = f"<Error: {e!s}>"

        return params_dict

    def _get_node_summary_light(self, node) -> dict:
        """Get lightweight information about a node (without properties for better performance)"""
        try:
            node_info = {
                "id": node.id,
                "name": node.name,
                "path": node.path,
                "opType": node.OPType,
                "properties": {},  # Empty properties for lightweight response
            }

            return node_info
        except Exception as e:
            log_message(f"Error collecting node information: {e!s}", LogLevel.WARNING)
            return {"name": node.name if hasattr(node, "name") else "unknown"}

    def _get_node_summary(self, node) -> dict:
        """Get detailed information about a node"""
        try:
            node_info = {
                "id": node.id,
                "name": node.name,
                "path": node.path,
                "opType": node.OPType,
                "properties": self._get_node_properties(node),
            }

            return node_info
        except Exception as e:
            log_message(f"Error collecting node information: {e!s}", LogLevel.WARNING)
            return {"name": node.name if hasattr(node, "name") else "unknown"}

    def _resolve_help_target(self, module_name: str) -> Any | None:
        """Locate a module/class for help() lookup."""
        if not module_name:
            return None

        target_name = module_name.strip()
        if not target_name:
            return None

        # Handle dotted names like "td.noiseCHOP" or "td.tdu.SomeClass"
        def resolve_dotted_name(name: str) -> Any | None:
            parts = name.split(".")
            # Only allow access starting from td or tdu
            if parts[0] == "td":
                obj: Any = td
            elif parts[0] == "tdu" and hasattr(td, "tdu"):
                obj = td.tdu
            else:
                return None
            for part in parts[1:]:
                # Validate part is non-empty and a valid identifier
                if not part or not part.isidentifier():
                    return None
                if not hasattr(obj, part):
                    return None
                obj = getattr(obj, part)
            return obj

        # Try resolving as a dotted name
        if "." in target_name:
            resolved = resolve_dotted_name(target_name)
            if resolved is not None:
                return resolved

        # Try direct attribute of td
        if hasattr(td, target_name):
            return getattr(td, target_name)

        # Try importing as a module
        imported = self._import_module_safely(target_name)
        if imported:
            return imported

        # Try importing with td. prefix
        if not target_name.startswith("td."):
            imported = self._import_module_safely(f"td.{target_name}")
            if imported:
                return imported

        return None

    def _import_module_safely(self, target: str) -> Any | None:
        try:
            return importlib.import_module(target)
        except (ImportError, ModuleNotFoundError) as e:
            log_message(f"Failed to import module '{target}': {e!s}", LogLevel.DEBUG)
            return None
        except Exception as e:
            log_message(
                f"Unexpected error importing module '{target}': {e!s}",
                LogLevel.WARNING,
            )
            return None

    def _normalize_help_text(self, text: str) -> str:
        """Normalize help text by removing terminal control sequences.

        The pydoc module uses backspace characters (\b) for text formatting
        (e.g., bold text is written as "c\bc" to print 'c' over 'c').
        This method removes those backspace sequences to produce clean text.
        If a backspace is encountered at the start (empty buffer), it is safely
        ignored as there is no character to remove.
        """
        if not text:
            return text
        buffer: list[str] = []
        for char in text:
            if char == "\b":
                if buffer:
                    buffer.pop()
                continue
            buffer.append(char)
        return "".join(buffer)

    def _process_method_result(self, result: Any) -> Any:
        """
        Process method result based on its type to make it JSON serializable

        Args:
            result: Result value to process

        Returns:
            Processed value that can be serialized to JSON
        """
        if isinstance(result, (int, float, str, bool)) or result is None:
            return result

        if isinstance(result, (list, tuple)):
            processed_list = []
            for item in result:
                processed_list.append(self._process_item(item))
            return processed_list

        if isinstance(result, dict):
            processed_dict = {}
            for key, value in result.items():
                processed_dict[key] = self._process_item(value)
            return processed_dict

        try:
            result_dict = {}
            for item in result:
                processed = self._process_item(item)
                if hasattr(item, "name"):
                    result_dict[item.name] = processed
                else:
                    result_dict[f"item_{len(result_dict)}"] = processed
            return result_dict
        except TypeError:
            return self._process_item(result)

    def _process_item(self, item: Any) -> Any:
        """
        Process individual item from a result for JSON serialization

        Args:
            item: Item to process

        Returns:
            Processed item that can be serialized to JSON
        """
        if isinstance(item, (int, float, str, bool)) or item is None:
            return item

        if hasattr(td, "op") and callable(td.op):
            node = td.op(item)
            if node and hasattr(node, "valid") and node.valid:
                return self._get_node_summary(node)

        if not callable(item) and hasattr(item, "name"):
            return str(item)

        if hasattr(item, "eval") and callable(item.eval):
            try:
                value = item.eval()
                if hasattr(td, "OP") and isinstance(value, td.OP):
                    return value.path
                return value
            except Exception as e:
                log_message(
                    "Error evaluating parameter "
                    f"{item.name if hasattr(item, 'name') else 'unknown'}: {e!s}",
                    LogLevel.DEBUG,
                )
                return f"<Error: {e!s}>"

        try:
            return safe_serialize(item)
        except Exception:
            return str(item)


api_service = TouchDesignerApiService()
