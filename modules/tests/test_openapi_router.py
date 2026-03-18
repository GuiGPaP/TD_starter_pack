"""Tests for mcp.controllers.openapi_router module."""

from unittest.mock import patch

from mcp.controllers.openapi_router import (
    OpenAPIRouter,
    RouteDefinition,
    extract_routes,
    match_route,
)
from utils.types import Result

MINI_SCHEMA = {
    "info": {"version": "1.0.0"},
    "paths": {
        "/api/nodes": {
            "get": {
                "operationId": "get_nodes",
                "parameters": [{"name": "parentPath", "in": "query"}],
            },
            "post": {
                "operationId": "create_node",
                "requestBody": {"content": {"application/json": {}}},
            },
        },
        "/api/nodes/{nodePath}": {
            "get": {"operationId": "get_node_detail", "parameters": []},
        },
        "/api/info": {
            "get": {"operationId": "get_info"},
        },
    },
}


class TestExtractRoutes:
    def test_extracts_all_routes(self):
        routes = extract_routes(MINI_SCHEMA)
        op_ids = {r.operation_id for r in routes}
        assert op_ids == {"get_nodes", "create_node", "get_node_detail", "get_info"}

    def test_method_uppercased(self):
        routes = extract_routes(MINI_SCHEMA)
        for r in routes:
            assert r.method == r.method.upper()

    def test_has_request_body(self):
        routes = extract_routes(MINI_SCHEMA)
        create = next(r for r in routes if r.operation_id == "create_node")
        get = next(r for r in routes if r.operation_id == "get_nodes")
        assert create.has_request_body is True
        assert get.has_request_body is False

    def test_skips_non_http_methods(self):
        schema = {"paths": {"/x": {"summary": "ignored", "get": {"operationId": "ok"}}}}
        routes = extract_routes(schema)
        assert len(routes) == 1

    @patch("mcp.controllers.openapi_router.log_message")
    def test_skips_missing_operation_id(self, mock_log):
        schema = {"paths": {"/x": {"get": {}}}}
        routes = extract_routes(schema)
        assert len(routes) == 0

    def test_empty_schema(self):
        assert extract_routes({"paths": {}}) == []


class TestMatchRoute:
    ROUTES = extract_routes(MINI_SCHEMA)

    def test_exact_match(self):
        m = match_route("GET", "/api/nodes", self.ROUTES)
        assert m is not None
        assert m.route.operation_id == "get_nodes"
        assert m.path_params == {}

    def test_method_mismatch(self):
        m = match_route("DELETE", "/api/nodes", self.ROUTES)
        assert m is None

    def test_path_params(self):
        m = match_route("GET", "/api/nodes/project1/geo1", self.ROUTES)
        assert m is not None
        assert m.route.operation_id == "get_node_detail"
        assert m.path_params["nodePath"] == "project1/geo1"

    def test_no_match(self):
        m = match_route("GET", "/api/nonexistent", self.ROUTES)
        assert m is None


class TestOpenAPIRouter:
    def test_register_and_route(self):
        router = OpenAPIRouter(load_schema=False)
        route = RouteDefinition(method="GET", path_pattern="/test", operation_id="test_op")
        router.routes = [route]
        router._routes_by_operation_id = {"test_op": route}

        handler_called_with = {}

        def handler(**kwargs) -> Result:
            handler_called_with.update(kwargs)
            return {"success": True, "data": "ok", "error": None}

        router.register_handler("test_op", handler)
        result = router.route_request("GET", "/test", {}, None)

        assert result["success"] is True

    def test_missing_route(self):
        router = OpenAPIRouter(load_schema=False)
        result = router.route_request("GET", "/nope", {}, None)
        assert result["success"] is False
        assert "NOT_FOUND" in result["error"]

    def test_missing_handler(self):
        router = OpenAPIRouter(load_schema=False)
        route = RouteDefinition(method="GET", path_pattern="/test", operation_id="no_handler")
        router.routes = [route]
        result = router.route_request("GET", "/test", {}, None)
        assert result["success"] is False
        assert "INTERNAL" in result["error"]

    @patch("mcp.controllers.openapi_router.log_message")
    def test_handler_error(self, mock_log):
        router = OpenAPIRouter(load_schema=False)
        route = RouteDefinition(method="GET", path_pattern="/err", operation_id="err_op")
        router.routes = [route]
        router._routes_by_operation_id = {"err_op": route}

        def bad_handler(**kwargs):
            raise RuntimeError("boom")

        router.register_handler("err_op", bad_handler)
        result = router.route_request("GET", "/err", {}, None)
        assert result["success"] is False
        assert "boom" in result["error"]

    def test_post_body_forwarded(self):
        router = OpenAPIRouter(load_schema=False)
        route = RouteDefinition(method="POST", path_pattern="/data", operation_id="post_op")
        router.routes = [route]
        router._routes_by_operation_id = {"post_op": route}

        received = {}

        def handler(**kwargs) -> Result:
            received.update(kwargs)
            return {"success": True, "data": None, "error": None}

        router.register_handler("post_op", handler)
        router.route_request("POST", "/data", {"q": "1"}, '{"key": "val"}')

        assert received["body"] == '{"key": "val"}'
        assert received["q"] == "1"

    def test_query_params_forwarded(self):
        router = OpenAPIRouter(load_schema=False)
        route = RouteDefinition(method="GET", path_pattern="/q", operation_id="q_op")
        router.routes = [route]
        router._routes_by_operation_id = {"q_op": route}

        received = {}

        def handler(**kwargs) -> Result:
            received.update(kwargs)
            return {"success": True, "data": None, "error": None}

        router.register_handler("q_op", handler)
        router.route_request("GET", "/q", {"foo": "bar"}, None)

        assert received["foo"] == "bar"

    @patch("mcp.controllers.openapi_router.openapi_schema", MINI_SCHEMA)
    @patch("mcp.controllers.openapi_router.log_message")
    def test_load_schema(self, mock_log):
        from mcp.controllers.openapi_router import load_schema

        schema = load_schema()
        assert schema is MINI_SCHEMA

    @patch("mcp.controllers.openapi_router.openapi_schema", None)
    @patch("mcp.controllers.openapi_router.log_message")
    def test_load_schema_missing(self, mock_log):
        from mcp.controllers.openapi_router import load_schema

        schema = load_schema()
        assert schema == {"paths": {}}
