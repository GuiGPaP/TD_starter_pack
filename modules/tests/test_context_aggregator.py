"""Tests for mcp.services.completion.context_aggregator — issue #41."""

from unittest.mock import MagicMock

from mcp.services.completion.context_aggregator import aggregate_context


def _make_service(**overrides):
    """Create a mock service with default success responses."""
    svc = MagicMock()

    def _success(data):
        return {"success": True, "data": data, "error": None}

    svc.get_node_parameter_schema.return_value = _success({"pars": []})
    svc.get_chop_channels.return_value = _success({"channels": []})
    svc.get_dat_table_info.return_value = _success({"rows": 0, "cols": 0})
    svc.get_comp_extensions.return_value = _success({"extensions": []})
    svc.get_nodes.return_value = _success({"nodes": []})
    svc.get_node_errors.return_value = _success({"errors": []})
    svc.get_dat_text.return_value = _success({"text": ""})

    for attr, val in overrides.items():
        setattr(svc, attr, val)
    return svc


class TestAggregateContext:
    def test_all_facets_by_default(self):
        svc = _make_service()
        r = aggregate_context(svc, "/project1/geo1")
        assert r["success"] is True
        facets = r["data"]["facets"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        assert "parameters" in facets
        assert "channels" in facets
        assert "errors" in facets

    def test_facet_selection(self):
        svc = _make_service()
        r = aggregate_context(svc, "/project1/geo1", include=["parameters", "errors"])
        assert r["success"] is True
        facets = r["data"]["facets"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        assert "parameters" in facets
        assert "errors" in facets
        # Should NOT have fetched others
        assert "channels" not in facets

    def test_partial_failure_produces_warnings(self):
        svc = _make_service()
        svc.get_chop_channels.return_value = {
            "success": False, "data": None, "error": "not a CHOP",
        }
        r = aggregate_context(svc, "/project1/geo1")
        assert r["success"] is True
        warnings = r["data"]["warnings"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        assert any("channels" in w for w in warnings)
        # Other facets still collected
        assert "parameters" in r["data"]["facets"]  # pyright: ignore[reportTypedDictNotRequiredAccess]

    def test_exception_produces_warning(self):
        svc = _make_service()
        svc.get_dat_text.side_effect = RuntimeError("boom")
        r = aggregate_context(svc, "/project1/geo1")
        assert r["success"] is True
        warnings = r["data"]["warnings"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        assert any("datText" in w for w in warnings)
        assert any("boom" in w for w in warnings)

    def test_invalid_facet_name(self):
        svc = _make_service()
        r = aggregate_context(svc, "/project1/geo1", include=["parameters", "nonexistent"])
        assert r["success"] is True
        warnings = r["data"]["warnings"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        assert any("nonexistent" in w for w in warnings)
        # Valid facet still collected
        assert "parameters" in r["data"]["facets"]  # pyright: ignore[reportTypedDictNotRequiredAccess]

    def test_empty_node_path(self):
        svc = _make_service()
        r = aggregate_context(svc, "")
        assert r["success"] is False

    def test_node_path_in_result(self):
        svc = _make_service()
        r = aggregate_context(svc, "/project1/text1")
        assert r["data"]["nodePath"] == "/project1/text1"  # pyright: ignore[reportTypedDictNotRequiredAccess]

    def test_empty_include_list(self):
        svc = _make_service()
        r = aggregate_context(svc, "/project1/geo1", include=[])
        assert r["success"] is True
        assert r["data"]["facets"] == {}  # pyright: ignore[reportTypedDictNotRequiredAccess]
        assert r["data"]["warnings"] == []  # pyright: ignore[reportTypedDictNotRequiredAccess]

    def test_method_not_on_service(self):
        """If the service lacks a method, produce a warning not a crash."""
        svc = _make_service()
        del svc.get_chop_channels
        r = aggregate_context(svc, "/project1/geo1", include=["channels"])
        assert r["success"] is True
        warnings = r["data"]["warnings"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        assert any("channels" in w for w in warnings)
