"""Smoke tests — starter workflows running service → helpers → fake TD graph.

No ``@patch`` on td_helpers — the real helpers execute against the fake graph.
"""

from __future__ import annotations

import importlib
import json
import sys
from unittest.mock import MagicMock

import pytest

from tests.fake_td import FakeContainer, FakeGraph, FakeOp


@pytest.fixture()
def starter(monkeypatch):
    """Wire a fake TD graph into api_service and yield (svc, graph, base)."""
    graph = FakeGraph()

    # Build a small hierarchy: /project1/base1
    root = FakeContainer("project1", graph=graph)
    base = FakeContainer("base1", parent=root, graph=graph)

    # Build the mock td module
    mock_td = MagicMock()
    mock_td.op = graph.op
    mock_td.OP = FakeOp  # isinstance(value, td.OP) check
    mock_td.app.version = "2023"
    mock_td.app.build = "30000"
    mock_td.app.osName = "Windows"
    mock_td.app.osVersion = "11"

    monkeypatch.setitem(sys.modules, "td", mock_td)

    # Ensure module is imported, then reload to bind to our mock td
    if "mcp.services.api_service" not in sys.modules:
        import mcp.services.api_service  # noqa: F401

    mod = importlib.reload(sys.modules["mcp.services.api_service"])
    svc = mod.TouchDesignerApiService()

    yield svc, graph, base


# ── 1. Geometry Comp Workflow ────────────────────────────────────────


class TestGeometryCompWorkflow:
    def test_create_success(self, starter):
        svc, _graph, _base = starter
        result = svc.create_geometry_comp("/project1/base1", "geo1", x=400, y=0)

        assert result["success"] is True
        data = result["data"]
        assert "geo" in data
        assert "inOp" in data
        assert "outOp" in data
        assert data["geo"]["opType"] == "geometryCOMP"

    def test_children_after_create(self, starter):
        svc, _graph, _base = starter
        svc.create_geometry_comp("/project1/base1", "geo1", x=400, y=0)

        nodes_result = svc.get_nodes("/project1/base1/geo1")
        assert nodes_result["success"] is True
        names = [n["name"] for n in nodes_result["data"]["nodes"]]
        assert "in1" in names
        assert "out1" in names
        # Default torus1 should have been destroyed
        assert "torus1" not in names

    def test_detail(self, starter):
        svc, _graph, _base = starter
        svc.create_geometry_comp("/project1/base1", "geo1")

        detail = svc.get_node_detail("/project1/base1/geo1")
        assert detail["success"] is True
        assert detail["data"]["opType"] == "geometryCOMP"
        assert detail["data"]["path"] == "/project1/base1/geo1"

    def test_no_errors(self, starter):
        svc, _graph, _base = starter
        svc.create_geometry_comp("/project1/base1", "geo1")

        errors = svc.get_node_errors("/project1/base1/geo1")
        assert errors["success"] is True
        assert errors["data"]["errorCount"] == 0


# ── 2. Feedback Loop Workflow ────────────────────────────────────────


class TestFeedbackLoopWorkflow:
    def test_create_returns_four_ops(self, starter):
        svc, _graph, _base = starter
        result = svc.create_feedback_loop("/project1/base1", "sim", process_type="glslTOP")

        assert result["success"] is True
        data = result["data"]
        assert set(data.keys()) == {"feedback", "process", "null_out", "const_init"}

    def test_children_visible(self, starter):
        svc, _graph, _base = starter
        svc.create_feedback_loop("/project1/base1", "sim")

        nodes_result = svc.get_nodes("/project1/base1")
        assert nodes_result["success"] is True
        names = [n["name"] for n in nodes_result["data"]["nodes"]]
        assert "sim_init" in names
        assert "sim_fb" in names
        assert "sim_proc" in names
        assert "sim_out" in names

    def test_no_errors(self, starter):
        svc, _graph, _base = starter
        svc.create_feedback_loop("/project1/base1", "sim")

        errors = svc.get_node_errors("/project1/base1")
        assert errors["success"] is True
        assert errors["data"]["errorCount"] == 0
        assert errors["data"]["hasErrors"] is False


# ── 3. Instancing Workflow ───────────────────────────────────────────


class TestInstancingWorkflow:
    def test_configure(self, starter):
        svc, _graph, _base = starter
        svc.create_geometry_comp("/project1/base1", "geo1")

        result = svc.configure_instancing("/project1/base1/geo1", "sopto1")
        assert result["success"] is True
        assert result["data"]["instanceOp"] == "sopto1"

    def test_instancing_in_properties(self, starter):
        svc, _graph, _base = starter
        svc.create_geometry_comp("/project1/base1", "geo1")
        svc.configure_instancing("/project1/base1/geo1", "sopto1")

        detail = svc.get_node_detail("/project1/base1/geo1")
        assert detail["success"] is True
        props = detail["data"]["properties"]
        assert props["instancing"] is True
        assert props["instanceop"] == "sopto1"


# ── 4. State Verification ───────────────────────────────────────────


class TestStateVerification:
    def test_td_info(self, starter):
        svc, _graph, _base = starter
        result = svc.get_td_info()

        assert result["success"] is True
        data = result["data"]
        assert "server" in data
        assert "version" in data

    def test_existing_node_detail(self, starter):
        svc, _graph, _base = starter
        detail = svc.get_node_detail("/project1/base1")

        assert detail["success"] is True
        assert detail["data"]["name"] == "base1"
        assert detail["data"]["path"] == "/project1/base1"

    def test_nonexistent_node(self, starter):
        svc, _graph, _base = starter
        detail = svc.get_node_detail("/nonexistent")

        assert detail["success"] is False

    def test_no_errors_on_base(self, starter):
        svc, _graph, _base = starter
        errors = svc.get_node_errors("/project1/base1")

        assert errors["success"] is True
        assert errors["data"]["errorCount"] == 0
        assert errors["data"]["hasErrors"] is False


# ── 5. DAT Text Workflow ─────────────────────────────────────────────


class TestDatTextWorkflow:
    def test_get_dat_text_success(self, starter):
        """Create a textDAT, set content, read it back."""
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "print('hello')")
        result = svc.get_dat_text("/project1/base1/script1")
        assert result["success"] is True
        assert result["data"]["text"] == "print('hello')"

    def test_get_dat_text_not_found(self, starter):
        svc, _graph, _base = starter
        result = svc.get_dat_text("/nonexistent")
        assert result["success"] is False

    def test_get_dat_text_no_text_attr(self, starter):
        """A baseCOMP has no .text → should fail."""
        svc, _graph, _base = starter
        result = svc.get_dat_text("/project1/base1")
        assert result["success"] is False

    def test_set_dat_text_success(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        result = svc.set_dat_text("/project1/base1/script1", "print('hello')")
        assert result["success"] is True
        assert result["data"]["length"] == len("print('hello')")
        # Verify round-trip
        read = svc.get_dat_text("/project1/base1/script1")
        assert read["data"]["text"] == "print('hello')"

    def test_set_dat_text_not_found(self, starter):
        svc, _graph, _base = starter
        result = svc.set_dat_text("/nonexistent", "code")
        assert result["success"] is False


# ── 6. Lint DAT Workflow ──────────────────────────────────────────────


class TestLintDatWorkflow:
    def _get_svc_module(self):
        return sys.modules["mcp.services.api_service"]

    def test_lint_clean_code(self, starter, monkeypatch):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "x = 1\n")

        monkeypatch.setattr(svc, "_find_ruff", lambda: "/usr/bin/ruff")
        svc_mod = self._get_svc_module()
        monkeypatch.setattr(
            svc_mod.subprocess,
            "run",
            lambda *a, **kw: MagicMock(returncode=0, stdout="[]", stderr=""),
        )

        result = svc.lint_dat("/project1/base1/script1")
        assert result["success"] is True
        assert result["data"]["diagnosticCount"] == 0
        assert result["data"]["diagnostics"] == []

    def test_lint_with_errors(self, starter, monkeypatch):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "import os\n")

        diag_json = json.dumps(
            [
                {
                    "code": "F401",
                    "message": "`os` imported but unused",
                    "location": {"row": 1, "column": 1},
                    "end_location": {"row": 1, "column": 10},
                    "fix": {"edits": []},
                }
            ]
        )

        monkeypatch.setattr(svc, "_find_ruff", lambda: "/usr/bin/ruff")
        svc_mod = self._get_svc_module()
        monkeypatch.setattr(
            svc_mod.subprocess,
            "run",
            lambda *a, **kw: MagicMock(returncode=1, stdout=diag_json, stderr=""),
        )

        result = svc.lint_dat("/project1/base1/script1")
        assert result["success"] is True
        assert result["data"]["diagnosticCount"] == 1
        d = result["data"]["diagnostics"][0]
        assert d["code"] == "F401"
        assert d["fixable"] is True

    def test_lint_not_found(self, starter):
        svc, _graph, _base = starter
        result = svc.lint_dat("/nonexistent")
        assert result["success"] is False

    def test_lint_no_text_attr(self, starter):
        svc, _graph, _base = starter
        result = svc.lint_dat("/project1/base1")
        assert result["success"] is False

    def test_ruff_not_found(self, starter, monkeypatch):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "x = 1\n")

        svc_mod = self._get_svc_module()
        monkeypatch.setattr(svc_mod.shutil, "which", lambda _name: None)
        # Ensure .venv candidate doesn't exist
        monkeypatch.setattr(svc_mod.Path, "is_file", lambda _self: False)

        result = svc.lint_dat("/project1/base1/script1")
        assert result["success"] is False
        assert "ruff not found" in result["error"]
