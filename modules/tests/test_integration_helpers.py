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
