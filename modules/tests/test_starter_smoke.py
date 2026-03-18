"""Smoke tests — starter workflows running service → helpers → fake TD graph.

No ``@patch`` on td_helpers — the real helpers execute against the fake graph.
"""

from __future__ import annotations

import importlib
import json
import sys
from unittest.mock import MagicMock

import pytest

from tests.fake_td import FakeContainer, FakeDat, FakeGraph, FakeOp


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

    def test_lint_fix_remaining_diagnostics(self, starter, monkeypatch):
        """Fix run followed by re-lint that still finds remaining issues."""
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "import os\nx=1\n")

        monkeypatch.setattr(svc, "_find_ruff", lambda: "/usr/bin/ruff")
        svc_mod = self._get_svc_module()

        # First call: ruff check --fix (returns initial diagnostics, writes fixed file)
        fix_diag = json.dumps([{
            "code": "F401",
            "message": "`os` imported but unused",
            "location": {"row": 1, "column": 1},
            "end_location": {"row": 1, "column": 10},
            "fix": {"edits": []},
        }])
        # Second call: re-lint (returns remaining issue)
        remaining_diag = json.dumps([{
            "code": "E711",
            "message": "comparison to None",
            "location": {"row": 2, "column": 1},
            "end_location": {"row": 2, "column": 5},
            "fix": None,
        }])

        call_count = {"n": 0}

        def mock_run(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # Write fixed code to the temp file (simulate --fix)
                tmp = args[0][-1] if args else kwargs.get("args", [""])[-1]
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write("x=1\n")  # os import removed
                return MagicMock(returncode=1, stdout=fix_diag, stderr="")
            else:
                return MagicMock(returncode=1, stdout=remaining_diag, stderr="")

        monkeypatch.setattr(svc_mod.subprocess, "run", mock_run)

        result = svc.lint_dat("/project1/base1/script1", fix=True)
        assert result["success"] is True
        assert result["data"]["fixed"] is True
        assert result["data"]["applied"] is True
        assert result["data"]["remainingDiagnosticCount"] == 1
        assert result["data"]["remainingDiagnostics"][0]["code"] == "E711"

    def test_lint_fix_no_remaining(self, starter, monkeypatch):
        """Fix run where re-lint returns zero remaining issues."""
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "import os\n")

        monkeypatch.setattr(svc, "_find_ruff", lambda: "/usr/bin/ruff")
        svc_mod = self._get_svc_module()

        fix_diag = json.dumps([{
            "code": "F401",
            "message": "`os` imported but unused",
            "location": {"row": 1, "column": 1},
            "end_location": {"row": 1, "column": 10},
            "fix": {"edits": []},
        }])

        call_count = {"n": 0}

        def mock_run(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                tmp = args[0][-1] if args else kwargs.get("args", [""])[-1]
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write("")  # all code removed by fix
                return MagicMock(returncode=1, stdout=fix_diag, stderr="")
            else:
                return MagicMock(returncode=0, stdout="[]", stderr="")

        monkeypatch.setattr(svc_mod.subprocess, "run", mock_run)

        result = svc.lint_dat("/project1/base1/script1", fix=True)
        assert result["success"] is True
        assert result["data"]["fixed"] is True
        assert result["data"]["remainingDiagnosticCount"] == 0
        assert result["data"]["remainingDiagnostics"] == []

    def test_lint_fix_dry_run(self, starter, monkeypatch):
        """dry_run=True with fix=True returns diff but doesn't modify node.text."""
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "script1")
        original_code = "import os\n"
        svc.set_dat_text("/project1/base1/script1", original_code)

        monkeypatch.setattr(svc, "_find_ruff", lambda: "/usr/bin/ruff")
        svc_mod = self._get_svc_module()

        fix_diag = json.dumps([{
            "code": "F401",
            "message": "`os` imported but unused",
            "location": {"row": 1, "column": 1},
            "end_location": {"row": 1, "column": 10},
            "fix": {"edits": []},
        }])

        call_count = {"n": 0}

        def mock_run(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                tmp = args[0][-1] if args else kwargs.get("args", [""])[-1]
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write("")  # fixed: removed import
                return MagicMock(returncode=1, stdout=fix_diag, stderr="")
            else:
                return MagicMock(returncode=0, stdout="[]", stderr="")

        monkeypatch.setattr(svc_mod.subprocess, "run", mock_run)

        result = svc.lint_dat("/project1/base1/script1", fix=True, dry_run=True)
        assert result["success"] is True
        assert result["data"]["applied"] is False
        assert "diff" in result["data"]
        assert len(result["data"]["diff"]) > 0
        # Node text must NOT be modified
        read_back = svc.get_dat_text("/project1/base1/script1")
        assert read_back["data"]["text"] == original_code

    def test_lint_dry_run_without_fix_noop(self, starter, monkeypatch):
        """dry_run=True without fix=True behaves as normal lint (no diff)."""
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

        result = svc.lint_dat("/project1/base1/script1", dry_run=True)
        assert result["success"] is True
        assert "diff" not in result["data"]
        assert "applied" not in result["data"]


# ── 7. DAT Classifier Unit Tests ──────────────────────────────────────


class TestClassifyDatKind:
    def test_script_dat(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "scriptDAT", "myscript")
        node = _graph.op("/project1/base1/myscript")
        kind, confidence, _why = svc._classify_dat_kind(node)
        assert kind == "python"
        assert confidence == "high"

    def test_text_dat_with_glsl_content(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "shader1")
        svc.set_dat_text(
            "/project1/base1/shader1",
            "#version 330\nvoid main() { gl_FragColor = vec4(1.0); }",
        )
        node = _graph.op("/project1/base1/shader1")
        kind, confidence, _why = svc._classify_dat_kind(node)
        assert kind == "glsl"
        assert confidence == "high"

    def test_text_dat_with_python_content(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "pycode")
        svc.set_dat_text(
            "/project1/base1/pycode",
            "import os\ndef main():\n    op('/project1').par.x = 1\n",
        )
        node = _graph.op("/project1/base1/pycode")
        kind, confidence, _why = svc._classify_dat_kind(node)
        assert kind == "python"
        assert confidence == "high"

    def test_text_dat_with_op_marker_only(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "short")
        svc.set_dat_text("/project1/base1/short", "# set value\nop('/project1').cook()\n")
        node = _graph.op("/project1/base1/short")
        kind, confidence, _why = svc._classify_dat_kind(node)
        assert kind == "python"
        assert confidence == "low"

    def test_empty_text_dat(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "empty1")
        node = _graph.op("/project1/base1/empty1")
        kind, confidence, _why = svc._classify_dat_kind(node)
        assert kind == "empty"
        assert confidence == "high"

    def test_prose_text_dat(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "notes")
        svc.set_dat_text("/project1/base1/notes", "This is a note about the project.\n")
        node = _graph.op("/project1/base1/notes")
        kind, confidence, _why = svc._classify_dat_kind(node)
        assert kind == "text"
        assert confidence == "low"

    def test_docked_pixel_dat(self, starter):
        svc, graph, base = starter
        # Create a docked DAT manually with dock reference
        glsl_comp = FakeContainer("glsl1", parent=base, graph=graph)
        base.children.append(glsl_comp)
        docked_dat = FakeDat(
            "glsl1_pixel",
            text="uniform float uTime;",
            parent=glsl_comp,
            graph=graph,
            dock=glsl_comp,
        )
        glsl_comp.children.append(docked_dat)
        kind, confidence, _why = svc._classify_dat_kind(docked_dat)
        assert kind == "glsl"
        assert confidence == "high"

    def test_table_dat(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "tableDAT", "data1")
        node = _graph.op("/project1/base1/data1")
        kind, confidence, _why = svc._classify_dat_kind(node)
        assert kind == "data"
        assert confidence == "high"


# ── 8. _find_text_dats Unit Tests ──────────────────────────────────────


class TestFindTextDats:
    def test_invalid_parent(self, starter):
        svc, _graph, _base = starter
        result = svc._find_text_dats("/nonexistent")
        assert result is None

    def test_mixed_children(self, starter):
        svc, _graph, _base = starter
        # Create a mix of DATs and non-DATs
        svc.create_node("/project1/base1", "textDAT", "dat1")
        svc.create_node("/project1/base1", "nullTOP", "null1")
        svc.create_node("/project1/base1", "textDAT", "dat2")
        result = svc._find_text_dats("/project1/base1")
        assert result is not None
        names = [n.name for n in result]
        assert "dat1" in names
        assert "dat2" in names
        assert "null1" not in names

    def test_recursive_vs_non_recursive(self, starter):
        svc, graph, base = starter
        # Create a nested structure
        sub = FakeContainer("sub", parent=base, graph=graph)
        base.children.append(sub)
        svc.create_node("/project1/base1", "textDAT", "top_dat")
        svc.create_node("/project1/base1/sub", "textDAT", "nested_dat")

        non_recursive = svc._find_text_dats("/project1/base1", recursive=False)
        recursive = svc._find_text_dats("/project1/base1", recursive=True)

        assert non_recursive is not None
        assert recursive is not None
        non_rec_names = [n.name for n in non_recursive]
        rec_names = [n.name for n in recursive]
        assert "top_dat" in non_rec_names
        assert "nested_dat" not in non_rec_names
        assert "top_dat" in rec_names
        assert "nested_dat" in rec_names


# ── 9. DAT Discovery Workflow ──────────────────────────────────────────


class TestDiscoverDatCandidates:
    def test_purpose_any(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "scriptDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "import os\ndef run(): pass\n")
        svc.create_node("/project1/base1", "textDAT", "shader1")
        svc.set_dat_text("/project1/base1/shader1", "#version 330\nvoid main() {}\n")
        svc.create_node("/project1/base1", "textDAT", "notes")
        svc.set_dat_text("/project1/base1/notes", "Just a note.\n")

        result = svc.discover_dat_candidates("/project1/base1")
        assert result["success"] is True
        data = result["data"]
        assert data["purpose"] == "any"
        kinds = {c["kindGuess"] for c in data["candidates"]}
        assert "python" in kinds
        assert "glsl" in kinds
        assert "text" in kinds

    def test_purpose_python(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "scriptDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "x = 1\n")
        svc.create_node("/project1/base1", "textDAT", "shader1")
        svc.set_dat_text("/project1/base1/shader1", "#version 330\nvoid main() {}\n")

        result = svc.discover_dat_candidates("/project1/base1", purpose="python")
        assert result["success"] is True
        for c in result["data"]["candidates"]:
            assert c["kindGuess"] == "python"

    def test_purpose_glsl(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "scriptDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "x = 1\n")
        svc.create_node("/project1/base1", "textDAT", "shader1")
        svc.set_dat_text("/project1/base1/shader1", "#version 330\nvoid main() {}\n")

        result = svc.discover_dat_candidates("/project1/base1", purpose="glsl")
        assert result["success"] is True
        for c in result["data"]["candidates"]:
            assert c["kindGuess"] == "glsl"

    def test_recursive(self, starter):
        svc, graph, base = starter
        sub = FakeContainer("sub", parent=base, graph=graph)
        base.children.append(sub)
        svc.create_node("/project1/base1", "textDAT", "top_script")
        svc.set_dat_text("/project1/base1/top_script", "import os\ndef run(): pass\n")
        svc.create_node("/project1/base1/sub", "textDAT", "nested_script")
        svc.set_dat_text("/project1/base1/sub/nested_script", "import sys\ndef go(): pass\n")

        non_rec = svc.discover_dat_candidates("/project1/base1", recursive=False)
        rec = svc.discover_dat_candidates("/project1/base1", recursive=True)
        assert non_rec["success"] is True
        assert rec["success"] is True
        non_rec_paths = [c["path"] for c in non_rec["data"]["candidates"]]
        rec_paths = [c["path"] for c in rec["data"]["candidates"]]
        assert "/project1/base1/sub/nested_script" not in non_rec_paths
        assert "/project1/base1/sub/nested_script" in rec_paths

    def test_empty_dats_excluded(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "textDAT", "empty1")
        # empty DAT — no text set

        result = svc.discover_dat_candidates("/project1/base1")
        assert result["success"] is True
        names = [c["name"] for c in result["data"]["candidates"]]
        assert "empty1" not in names

    def test_invalid_parent(self, starter):
        svc, _graph, _base = starter
        result = svc.discover_dat_candidates("/nonexistent")
        assert result["success"] is False

    def test_invalid_purpose(self, starter):
        svc, _graph, _base = starter
        result = svc.discover_dat_candidates("/project1/base1", purpose="invalid")
        assert result["success"] is False
        assert "Invalid purpose" in result["error"]

    def test_docked_dat_detection(self, starter):
        svc, graph, base = starter
        glsl_comp = FakeContainer("glsl1", parent=base, graph=graph)
        base.children.append(glsl_comp)
        docked = FakeDat(
            "glsl1_pixel",
            text="uniform float uTime;\nvoid main() {}\n",
            parent=glsl_comp,
            graph=graph,
            dock=glsl_comp,
        )
        glsl_comp.children.append(docked)

        result = svc.discover_dat_candidates("/project1/base1/glsl1")
        assert result["success"] is True
        assert result["data"]["count"] == 1
        c = result["data"]["candidates"][0]
        assert c["kindGuess"] == "glsl"
        assert c["isDocked"] is True
        assert c["confidence"] == "high"

    def test_sorted_by_confidence(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "scriptDAT", "z_script")
        svc.set_dat_text("/project1/base1/z_script", "x = 1\n")
        svc.create_node("/project1/base1", "textDAT", "a_notes")
        svc.set_dat_text("/project1/base1/a_notes", "just notes\n")

        result = svc.discover_dat_candidates("/project1/base1")
        assert result["success"] is True
        candidates = result["data"]["candidates"]
        assert len(candidates) >= 2
        # high confidence should come before low
        confs = [c["confidence"] for c in candidates]
        assert confs.index("high") < confs.index("low")

    def test_line_count(self, starter):
        svc, _graph, _base = starter
        svc.create_node("/project1/base1", "scriptDAT", "script1")
        svc.set_dat_text("/project1/base1/script1", "line1\nline2\nline3\n")

        result = svc.discover_dat_candidates("/project1/base1")
        assert result["success"] is True
        c = result["data"]["candidates"][0]
        assert c["lineCount"] == 4  # 3 \n + 1
