"""Integration tests for high-level helper MCP tools.

Tests the full pipeline: OpenAPI schema -> route -> handler -> service.
Marked with @pytest.mark.integration so they can be run separately.
"""

import importlib
import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
import yaml

import mcp
from mcp.controllers.openapi_router import OpenAPIRouter, extract_routes

# Load the real OpenAPI schema into the mcp package global so the router can use it
_SCHEMA_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "td_server",
    "openapi_server",
    "openapi",
    "openapi.yaml",
)
with open(_SCHEMA_PATH) as f:
    _OPENAPI_SCHEMA = yaml.safe_load(f)
    mcp.openapi_schema = _OPENAPI_SCHEMA


@pytest.fixture()
def mock_td():
    """Provide a fresh td mock for integration tests."""
    mock = MagicMock()
    mock.app.version = "2023"
    mock.app.build = "30000"
    mock.app.osName = "Windows"
    mock.app.osVersion = "11"
    return mock


@pytest.fixture()
def integration_router(mock_td, monkeypatch):
    """Build a fully wired router: real schema + real handlers + mocked td."""
    monkeypatch.setitem(sys.modules, "td", mock_td)

    # Patch the module-level binding so load_schema() finds the real schema
    import mcp.controllers.openapi_router as router_mod

    monkeypatch.setattr(router_mod, "openapi_schema", _OPENAPI_SCHEMA)

    # Reset handler singleton so it picks up our fresh mock
    import mcp.controllers.generated_handlers as handlers_mod

    handlers_mod._api_service_instance = None

    # Ensure api_service is importable, then reload to bind to our mock td
    if "mcp.services.api_service" not in sys.modules:
        import mcp.services.api_service  # noqa: F401

    importlib.reload(sys.modules["mcp.services.api_service"])

    # Build router from the real OpenAPI schema
    router = OpenAPIRouter()

    # Register all handlers from generated_handlers
    for operation_id in handlers_mod.__all__:
        handler = getattr(handlers_mod, operation_id, None)
        if callable(handler):
            router.register_handler(operation_id, handler)

    yield router

    # Cleanup singleton
    handlers_mod._api_service_instance = None


def _load_schema():
    """Load the real OpenAPI schema for route extraction tests."""
    return _OPENAPI_SCHEMA


# ── Route existence tests ─────────────────────────────────────────


@pytest.mark.integration
class TestRouteExistence:
    def test_create_geometry_comp_route_exists(self):
        schema = _load_schema()
        routes = extract_routes(schema)
        op_ids = {r.operation_id for r in routes}
        assert "create_geometry_comp" in op_ids

    def test_create_feedback_loop_route_exists(self):
        schema = _load_schema()
        routes = extract_routes(schema)
        op_ids = {r.operation_id for r in routes}
        assert "create_feedback_loop" in op_ids

    def test_configure_instancing_route_exists(self):
        schema = _load_schema()
        routes = extract_routes(schema)
        op_ids = {r.operation_id for r in routes}
        assert "configure_instancing" in op_ids

    def test_get_dat_text_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "get_dat_text" in {r.operation_id for r in routes}

    def test_set_dat_text_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "set_dat_text" in {r.operation_id for r in routes}

    def test_lint_dat_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "lint_dat" in {r.operation_id for r in routes}

    def test_format_dat_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "format_dat" in {r.operation_id for r in routes}

    def test_discover_dat_candidates_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "discover_dat_candidates" in {r.operation_id for r in routes}

    def test_get_node_parameter_schema_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "get_node_parameter_schema" in {r.operation_id for r in routes}

    def test_complete_op_paths_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "complete_op_paths" in {r.operation_id for r in routes}

    def test_get_chop_channels_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "get_chop_channels" in {r.operation_id for r in routes}

    def test_get_dat_table_info_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "get_dat_table_info" in {r.operation_id for r in routes}

    def test_get_comp_extensions_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "get_comp_extensions" in {r.operation_id for r in routes}

    def test_get_health_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "get_health" in {r.operation_id for r in routes}

    def test_get_capabilities_route_exists(self):
        routes = extract_routes(_load_schema())
        assert "get_capabilities" in {r.operation_id for r in routes}


# ── End-to-end tests ──────────────────────────────────────────────


@pytest.mark.integration
class TestEndToEnd:
    @patch("td_helpers.network.setup_geometry_comp")
    def test_create_geometry_comp_end_to_end(self, mock_setup, integration_router, mock_td):
        parent = MagicMock()
        parent.valid = True

        geo = MagicMock()
        geo.id = 1
        geo.name = "geo1"
        geo.path = "/project1/geo1"
        geo.OPType = "geometryCOMP"
        geo.pars.return_value = []

        in_op = MagicMock()
        in_op.id = 2
        in_op.name = "in1"
        in_op.path = "/project1/geo1/in1"
        in_op.OPType = "inTOP"

        out_op = MagicMock()
        out_op.id = 3
        out_op.name = "out1"
        out_op.path = "/project1/geo1/out1"
        out_op.OPType = "outTOP"

        mock_setup.return_value = (geo, in_op, out_op)
        mock_td.op.return_value = parent

        body = json.dumps({"parentPath": "/project1", "name": "geo1"})
        result = integration_router.route_request("POST", "/api/td/helpers/geometry-comp", {}, body)
        assert result["success"] is True

    @patch("td_helpers.network.setup_feedback_loop")
    def test_create_feedback_loop_end_to_end(self, mock_setup, integration_router, mock_td):
        parent = MagicMock()
        parent.valid = True

        ops = {}
        for name in ("cache", "feedback", "process", "comp"):
            m = MagicMock()
            m.id = hash(name) % 1000
            m.name = name
            m.path = f"/project1/{name}"
            m.OPType = "feedbackTOP"
            ops[name] = m

        mock_setup.return_value = ops
        mock_td.op.return_value = parent

        body = json.dumps({"parentPath": "/project1", "name": "sim", "processType": "glslTOP"})
        result = integration_router.route_request("POST", "/api/td/helpers/feedback-loop", {}, body)
        assert result["success"] is True

    @patch("td_helpers.network.setup_instancing")
    def test_configure_instancing_end_to_end(self, mock_setup, integration_router, mock_td):
        geo = MagicMock()
        geo.valid = True
        geo.id = 1
        geo.name = "geo1"
        geo.path = "/project1/geo1"
        geo.OPType = "geometryCOMP"
        mock_td.op.return_value = geo

        body = json.dumps({"geoPath": "/project1/geo1", "instanceOpName": "particles"})
        result = integration_router.route_request("POST", "/api/td/helpers/instancing", {}, body)
        assert result["success"] is True
        assert result["data"]["instanceOp"] == "particles"

    def test_get_dat_text_end_to_end(self, integration_router, mock_td):
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/text1"
        dat.name = "text1"
        dat.text = "print('hello')"
        mock_td.op.return_value = dat

        result = integration_router.route_request(
            "GET", "/api/nodes/dat-text", {"nodePath": "/project1/text1"}, None
        )
        assert result["success"] is True
        assert result["data"]["text"] == "print('hello')"

    def test_set_dat_text_end_to_end(self, integration_router, mock_td):
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/text1"
        dat.name = "text1"
        dat.text = ""
        mock_td.op.return_value = dat

        body = json.dumps({"nodePath": "/project1/text1", "text": "print('world')"})
        result = integration_router.route_request("PUT", "/api/nodes/dat-text", {}, body)
        assert result["success"] is True
        assert result["data"]["length"] == len("print('world')")

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_lint_dat_end_to_end(self, _mock_which, mock_run, integration_router, mock_td):
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "import os\n"
        mock_td.op.return_value = dat

        mock_run.return_value = MagicMock(returncode=0, stdout="[]", stderr="")

        body = json.dumps({"nodePath": "/project1/script1"})
        result = integration_router.route_request("POST", "/api/nodes/dat-lint", {}, body)
        assert result["success"] is True
        assert result["data"]["diagnosticCount"] == 0

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_lint_dat_dry_run_end_to_end(self, _mock_which, mock_run, integration_router, mock_td):
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "import os\n"
        dat.errors.return_value = ""
        mock_td.op.return_value = dat

        fix_diag = json.dumps(
            [
                {
                    "code": "F401",
                    "message": "unused import",
                    "location": {"row": 1, "column": 1},
                    "end_location": {"row": 1, "column": 10},
                    "fix": {"edits": []},
                }
            ]
        )
        call_count = {"n": 0}

        def side_effect(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                tmp = args[0][-1]
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write("")  # fixed
                return MagicMock(returncode=1, stdout=fix_diag, stderr="")
            return MagicMock(returncode=0, stdout="[]", stderr="")

        mock_run.side_effect = side_effect

        body = json.dumps({"nodePath": "/project1/script1", "fix": True, "dryRun": True})
        result = integration_router.route_request("POST", "/api/nodes/dat-lint", {}, body)
        assert result["success"] is True
        assert result["data"]["applied"] is False
        assert "diff" in result["data"]

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_lint_dat_fix_with_remaining_end_to_end(
        self, _mock_which, mock_run, integration_router, mock_td
    ):
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "import os\nx=1\n"
        dat.errors.return_value = ""
        mock_td.op.return_value = dat

        fix_diag = json.dumps(
            [
                {
                    "code": "F401",
                    "message": "unused import",
                    "location": {"row": 1, "column": 1},
                    "end_location": {"row": 1, "column": 10},
                    "fix": {"edits": []},
                }
            ]
        )
        remaining_diag = json.dumps(
            [
                {
                    "code": "E711",
                    "message": "comparison to None",
                    "location": {"row": 1, "column": 1},
                    "end_location": {"row": 1, "column": 5},
                    "fix": None,
                }
            ]
        )
        call_count = {"n": 0}

        def side_effect(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                tmp = args[0][-1]
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write("x=1\n")
                return MagicMock(returncode=1, stdout=fix_diag, stderr="")
            return MagicMock(returncode=1, stdout=remaining_diag, stderr="")

        mock_run.side_effect = side_effect

        body = json.dumps({"nodePath": "/project1/script1", "fix": True})
        result = integration_router.route_request("POST", "/api/nodes/dat-lint", {}, body)
        assert result["success"] is True
        assert result["data"]["fixed"] is True
        assert result["data"]["remainingDiagnosticCount"] == 1
        assert result["data"]["remainingDiagnostics"][0]["code"] == "E711"

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_lint_dat_correction_loop_end_to_end(
        self, _mock_which, mock_run, integration_router, mock_td
    ):
        """Full correction loop: lint(check) -> lint(dryRun) -> lint(fix)."""
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "import os\n"
        dat.errors.return_value = ""
        mock_td.op.return_value = dat

        diag = json.dumps(
            [
                {
                    "code": "F401",
                    "message": "unused import",
                    "location": {"row": 1, "column": 1},
                    "end_location": {"row": 1, "column": 10},
                    "fix": {"edits": []},
                }
            ]
        )

        def make_side_effect():
            call_count = {"n": 0}

            def side_effect(*args, **kwargs):
                call_count["n"] += 1
                cmd = args[0] if args else kwargs.get("args", [])
                if "--fix" in cmd:
                    tmp = cmd[-1]
                    with open(tmp, "w", encoding="utf-8") as f:
                        f.write("")  # fixed
                    return MagicMock(returncode=1, stdout=diag, stderr="")
                rc = 1 if call_count["n"] <= 2 else 0
                out = diag if call_count["n"] <= 2 else "[]"
                return MagicMock(returncode=rc, stdout=out, stderr="")

            return side_effect

        # Step 1: lint check only
        mock_run.side_effect = make_side_effect()
        body1 = json.dumps({"nodePath": "/project1/script1"})
        r1 = integration_router.route_request("POST", "/api/nodes/dat-lint", {}, body1)
        assert r1["success"] is True
        assert r1["data"]["diagnosticCount"] == 1

        # Step 2: lint dry-run
        mock_run.side_effect = make_side_effect()
        body2 = json.dumps({"nodePath": "/project1/script1", "fix": True, "dryRun": True})
        r2 = integration_router.route_request("POST", "/api/nodes/dat-lint", {}, body2)
        assert r2["success"] is True
        assert r2["data"]["applied"] is False
        assert "diff" in r2["data"]

        # Step 3: lint fix (apply)
        mock_run.side_effect = make_side_effect()
        body3 = json.dumps({"nodePath": "/project1/script1", "fix": True})
        r3 = integration_router.route_request("POST", "/api/nodes/dat-lint", {}, body3)
        assert r3["success"] is True
        assert r3["data"]["applied"] is True

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_format_dat_end_to_end(self, _mock_which, mock_run, integration_router, mock_td):
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "x=1\n"
        mock_td.op.return_value = dat

        def side_effect(*args, **kwargs):
            tmp = args[0][-1]
            with open(tmp, "w", encoding="utf-8") as f:
                f.write("x = 1\n")
            return MagicMock(returncode=0, stdout="", stderr="")

        mock_run.side_effect = side_effect

        body = json.dumps({"nodePath": "/project1/script1"})
        result = integration_router.route_request("POST", "/api/nodes/dat-format", {}, body)
        assert result["success"] is True
        assert result["data"]["changed"] is True
        assert result["data"]["applied"] is True

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_format_dat_dry_run_end_to_end(
        self, _mock_which, mock_run, integration_router, mock_td
    ):
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "x=1\n"
        mock_td.op.return_value = dat

        def side_effect(*args, **kwargs):
            tmp = args[0][-1]
            with open(tmp, "w", encoding="utf-8") as f:
                f.write("x = 1\n")
            return MagicMock(returncode=0, stdout="", stderr="")

        mock_run.side_effect = side_effect

        body = json.dumps({"nodePath": "/project1/script1", "dryRun": True})
        result = integration_router.route_request("POST", "/api/nodes/dat-format", {}, body)
        assert result["success"] is True
        assert result["data"]["changed"] is True
        assert result["data"]["applied"] is False
        assert "diff" in result["data"]
        assert len(result["data"]["diff"]) > 0

    def test_discover_dat_candidates_end_to_end(self, integration_router, mock_td):
        parent = MagicMock()
        parent.valid = True
        parent.path = "/project1"

        script_dat = MagicMock()
        script_dat.path = "/project1/script1"
        script_dat.name = "script1"
        script_dat.OPType = "scriptDAT"
        script_dat.text = "print('hello')"
        script_dat.parent.return_value = parent
        script_dat.dock = None

        parent.findChildren.return_value = [script_dat]
        mock_td.op.return_value = parent

        result = integration_router.route_request(
            "GET", "/api/nodes/dat-discover", {"parentPath": "/project1"}, None
        )
        assert result["success"] is True
        assert result["data"]["count"] >= 1
        assert result["data"]["candidates"][0]["kindGuess"] == "python"

    def test_get_node_parameter_schema_end_to_end(self, integration_router, mock_td):
        node = MagicMock()
        node.valid = True
        node.path = "/project1/noise1"
        node.OPType = "noiseCHOP"

        par = MagicMock()
        par.name = "seed"
        par.label = "Seed"
        par.style = "Int"
        par.default = 0
        par.min = 0
        par.max = 100
        par.clampMin = True
        par.clampMax = False
        par.menuNames = ()
        par.menuLabels = ()
        par.isOP = False
        par.readOnly = False
        par.page = "Noise"
        par.eval.return_value = 42

        node.pars.return_value = [par]
        mock_td.op.return_value = node
        mock_td.OP = MagicMock  # isinstance check

        result = integration_router.route_request(
            "GET", "/api/nodes/parameter-schema", {"nodePath": "/project1/noise1"}, None
        )
        assert result["success"] is True
        assert result["data"]["count"] == 1
        assert result["data"]["parameters"][0]["name"] == "seed"

    def test_complete_op_paths_end_to_end(self, integration_router, mock_td):
        context = MagicMock()
        context.valid = True
        context.path = "/project1/script1"
        parent = MagicMock()
        parent.valid = True
        parent.path = "/project1"

        sibling = MagicMock()
        sibling.name = "noise1"
        sibling.path = "/project1/noise1"
        sibling.OPType = "noiseCHOP"
        sibling.family = "CHOP"

        context.parent.return_value = parent
        parent.findChildren.return_value = [sibling]
        mock_td.op.return_value = context

        result = integration_router.route_request(
            "GET",
            "/api/nodes/complete-paths",
            {"contextNodePath": "/project1/script1", "prefix": "noise"},
            None,
        )
        assert result["success"] is True
        assert result["data"]["count"] >= 1

    def test_get_chop_channels_end_to_end(self, integration_router, mock_td):
        node = MagicMock()
        node.valid = True
        node.path = "/project1/noise1"
        node.numChans = 2
        node.numSamples = 100
        node.sampleRate = 60.0

        ch0 = MagicMock()
        ch0.name = "tx"
        ch0.vals = [1.0, 2.0]
        ch1 = MagicMock()
        ch1.name = "ty"
        ch1.vals = [3.0]
        node.chan.side_effect = lambda i: [ch0, ch1][i] if i < 2 else None
        mock_td.op.return_value = node

        result = integration_router.route_request(
            "GET", "/api/nodes/chop-channels", {"nodePath": "/project1/noise1"}, None
        )
        assert result["success"] is True
        assert result["data"]["numChannels"] == 2

    def test_get_dat_table_info_end_to_end(self, integration_router, mock_td):
        node = MagicMock()
        node.valid = True
        node.path = "/project1/table1"
        node.numRows = 2
        node.numCols = 2

        cell = MagicMock()
        cell.val = "hello"
        node.__getitem__ = MagicMock(return_value=cell)
        mock_td.op.return_value = node

        result = integration_router.route_request(
            "GET", "/api/nodes/dat-table-info", {"nodePath": "/project1/table1"}, None
        )
        assert result["success"] is True
        assert result["data"]["numRows"] == 2

    def test_get_comp_extensions_end_to_end(self, integration_router, mock_td):
        comp = MagicMock()
        comp.valid = True
        comp.path = "/project1/base1"
        comp.extensions = []
        mock_td.op.return_value = comp

        result = integration_router.route_request(
            "GET", "/api/nodes/comp-extensions", {"compPath": "/project1/base1"}, None
        )
        assert result["success"] is True
        assert result["data"]["extensions"] == []

    def test_get_health_end_to_end(self, integration_router, mock_td):
        result = integration_router.route_request("GET", "/api/health", {}, None)
        assert result["success"] is True
        assert result["data"]["status"] == "ok"
        assert result["data"]["tdVersion"] == "2023.30000"
        assert result["data"]["tdBuild"] == "30000"
        assert "pythonVersion" in result["data"]

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_get_capabilities_end_to_end(self, _mock_which, mock_run, integration_router, mock_td):
        mock_run.return_value = MagicMock(returncode=0, stdout="ruff 0.8.6", stderr="")
        result = integration_router.route_request("GET", "/api/capabilities", {}, None)
        assert result["success"] is True
        assert result["data"]["lint_dat"] is True
        assert result["data"]["tools"]["ruff"]["installed"] is True
