"""Tests for mcp.services.api_service module.

The `td` module is mocked globally via conftest.py so that collection
succeeds. Each test gets a fresh MagicMock wired into sys.modules["td"]
and the api_service module is reloaded to pick it up.
"""

import importlib
import sys
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def api_service_module(monkeypatch):
    """Provide a fresh td mock and reloaded api_service module per test."""
    mock_td = MagicMock()
    mock_td.app.version = "2023"
    mock_td.app.build = "30000"
    mock_td.app.osName = "Windows"
    mock_td.app.osVersion = "11"

    monkeypatch.setitem(sys.modules, "td", mock_td)

    # Ensure module is in sys.modules, then reload so `import td` binds to our fresh mock
    if "mcp.services.api_service" not in sys.modules:
        import mcp.services.api_service  # noqa: F401

    mod = importlib.reload(sys.modules["mcp.services.api_service"])
    mod._mock_td = mock_td  # stash for tests
    yield mod


# ── Pure method tests ──────────────────────────────────────────────


class TestNormalizeHelpText:
    def test_plain_text(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        assert svc._normalize_help_text("hello") == "hello"

    def test_backspace_removal(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        # pydoc bold: "H\bHe\bel\bll\blo\bo" → "Hello"
        assert svc._normalize_help_text("H\bHe\bel\bll\blo\bo") == "Hello"

    def test_empty_string(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        assert svc._normalize_help_text("") == ""

    def test_backspace_at_start(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        # Backspace with empty buffer → safely ignored
        assert svc._normalize_help_text("\bhello") == "hello"


class TestProcessMethodResult:
    def test_primitive_passthrough(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        assert svc._process_method_result(42) == 42
        assert svc._process_method_result("hi") == "hi"
        assert svc._process_method_result(None) is None
        assert svc._process_method_result(True) is True

    def test_list(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        result = svc._process_method_result([1, "a"])
        assert isinstance(result, list)
        assert result[0] == 1

    def test_dict(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        result = svc._process_method_result({"k": "v"})
        assert result == {"k": "v"}


# ── Success path tests ─────────────────────────────────────────────


class TestGetTdInfo:
    def test_returns_server_info(self, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_td_info()
        assert r["success"] is True
        assert "2023" in r["data"]["version"]
        assert r["data"]["osName"] == "Windows"


class TestGetCapabilities:
    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_capabilities_with_ruff(self, mock_which, mock_run, api_service_module):
        mock_run.return_value = MagicMock(returncode=0, stdout="ruff 0.8.6", stderr="")
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_capabilities()
        assert r["success"] is True
        assert r["data"]["lint_dat"] is True
        assert r["data"]["tools"]["ruff"]["installed"] is True
        assert r["data"]["tools"]["ruff"]["version"] == "ruff 0.8.6"

    @patch(
        "mcp.services.api_service.TouchDesignerApiService._find_ruff",
        return_value=None,
    )
    @patch("mcp.services.api_service.shutil.which", return_value=None)
    def test_capabilities_without_ruff(self, mock_which, mock_find_ruff, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_capabilities()
        assert r["success"] is True
        assert r["data"]["lint_dat"] is False
        assert r["data"]["tools"]["ruff"]["installed"] is False
        assert r["data"]["tools"]["ruff"]["version"] is None

    @patch(
        "mcp.services.api_service.TouchDesignerApiService._find_ruff",
        return_value=None,
    )
    @patch("mcp.services.api_service.shutil.which", return_value=None)
    def test_capabilities_format_and_typecheck_false(
        self, mock_which, mock_find_ruff, api_service_module
    ):
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_capabilities()
        assert r["data"]["format_dat"] is False
        assert r["data"]["typecheck_dat"] is False


class TestGetModuleHelp:
    @patch("mcp.services.api_service.log_message")
    def test_known_module(self, mock_log, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_module_help("json")
        assert r["success"] is True
        assert r["data"]["moduleName"] == "json"
        assert len(r["data"]["helpText"]) > 0

    @patch("mcp.services.api_service.log_message")
    def test_empty_module_name(self, mock_log, api_service_module):
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_module_help("")
        assert r["success"] is False


class TestGetNodeErrors:
    def test_node_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_node_errors("/bad/path")
        assert r["success"] is False

    def test_node_with_no_errors(self, api_service_module):
        mock_td = api_service_module._mock_td
        node = MagicMock()
        node.valid = True
        node.path = "/project1"
        node.name = "project1"
        node.OPType = "COMP"
        node.errors.return_value = ""
        mock_td.op.return_value = node

        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_node_errors("/project1")
        assert r["success"] is True
        assert r["data"]["errorCount"] == 0
        assert r["data"]["hasErrors"] is False


class TestCreateNode:
    def test_parent_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.create_node("/bad", "textTOP")
        assert r["success"] is False

    def test_successful_create(self, api_service_module):
        mock_td = api_service_module._mock_td
        parent = MagicMock()
        parent.valid = True
        new_node = MagicMock()
        new_node.valid = True
        new_node.id = 1
        new_node.name = "text1"
        new_node.path = "/project1/text1"
        new_node.OPType = "textTOP"
        new_node.pars.return_value = []
        parent.create.return_value = new_node
        mock_td.op.return_value = parent

        svc = api_service_module.TouchDesignerApiService()
        r = svc.create_node("/project1", "textTOP", "text1")
        assert r["success"] is True


class TestDeleteNode:
    def test_node_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.delete_node("/bad")
        assert r["success"] is False

    def test_successful_delete(self, api_service_module):
        mock_td = api_service_module._mock_td
        node = MagicMock()
        node.valid = True
        node.id = 1
        node.name = "geo1"
        node.path = "/project1/geo1"
        node.OPType = "geometryCOMP"
        node.pars.return_value = []
        # First call returns node, second (post-destroy verify) returns None
        mock_td.op.side_effect = [node, None]

        svc = api_service_module.TouchDesignerApiService()
        r = svc.delete_node("/project1/geo1")
        assert r["success"] is True
        assert r["data"]["deleted"] is True


# ── Error path tests ───────────────────────────────────────────────


class TestErrorPaths:
    def test_get_node_detail_bad_path(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_node_detail("/bad")
        assert r["success"] is False

    def test_get_nodes_bad_parent(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.get_nodes("/bad")
        assert r["success"] is False

    def test_exec_node_method_bad_path(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.exec_node_method("/bad", "cook", [], {})
        assert r["success"] is False

    def test_update_node_bad_path(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.update_node("/bad", {"x": 1})
        assert r["success"] is False


# ── Helper tool tests ─────────────────────────────────────────────


class TestCreateGeometryComp:
    def test_parent_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.create_geometry_comp("/bad")
        assert r["success"] is False

    @patch("td_helpers.network.setup_geometry_comp")
    def test_successful_create(self, mock_setup, api_service_module):
        mock_td = api_service_module._mock_td
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

        svc = api_service_module.TouchDesignerApiService()
        r = svc.create_geometry_comp("/project1", name="geo1")
        assert r["success"] is True
        assert "geo" in r["data"]
        assert "inOp" in r["data"]
        assert "outOp" in r["data"]


class TestCreateFeedbackLoop:
    def test_parent_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.create_feedback_loop("/bad")
        assert r["success"] is False

    @patch("td_helpers.network.setup_feedback_loop")
    def test_successful_create(self, mock_setup, api_service_module):
        mock_td = api_service_module._mock_td
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

        svc = api_service_module.TouchDesignerApiService()
        r = svc.create_feedback_loop("/project1")
        assert r["success"] is True
        assert len(r["data"]) == 4


class TestFormatDat:
    def test_node_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.format_dat("/bad")
        assert r["success"] is False

    def test_no_text_attribute(self, api_service_module):
        mock_td = api_service_module._mock_td
        node = MagicMock(spec=[])  # no .text attribute
        node.valid = True
        mock_td.op.return_value = node
        svc = api_service_module.TouchDesignerApiService()
        r = svc.format_dat("/project1/table1")
        assert r["success"] is False

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_no_changes(self, _mock_which, mock_run, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "x = 1\n"
        mock_td.op.return_value = dat

        def side_effect(*args, **kwargs):
            # ruff format writes in-place; simulate no change
            return MagicMock(returncode=0, stdout="", stderr="")

        mock_run.side_effect = side_effect

        svc = api_service_module.TouchDesignerApiService()
        r = svc.format_dat("/project1/script1")
        assert r["success"] is True
        assert r["data"]["changed"] is False
        assert r["data"]["applied"] is False

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_dry_run_returns_diff(self, _mock_which, mock_run, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "x=1\n"
        mock_td.op.return_value = dat

        def side_effect(*args, **kwargs):
            # ruff format writes in-place; simulate formatting change
            tmp = args[0][-1]
            with open(tmp, "w", encoding="utf-8") as f:
                f.write("x = 1\n")
            return MagicMock(returncode=0, stdout="", stderr="")

        mock_run.side_effect = side_effect

        svc = api_service_module.TouchDesignerApiService()
        r = svc.format_dat("/project1/script1", dry_run=True)
        assert r["success"] is True
        assert r["data"]["changed"] is True
        assert r["data"]["applied"] is False
        assert "diff" in r["data"]
        assert len(r["data"]["diff"]) > 0

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_apply_writes_back(self, _mock_which, mock_run, api_service_module):
        mock_td = api_service_module._mock_td
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

        svc = api_service_module.TouchDesignerApiService()
        r = svc.format_dat("/project1/script1", dry_run=False)
        assert r["success"] is True
        assert r["data"]["changed"] is True
        assert r["data"]["applied"] is True
        assert r["data"]["formattedText"] == "x = 1\n"
        assert dat.text == "x = 1\n"

    @patch(
        "mcp.services.api_service.TouchDesignerApiService._find_ruff",
        return_value=None,
    )
    def test_ruff_not_found(self, _mock_find, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/script1"
        dat.name = "script1"
        dat.text = "x=1\n"
        mock_td.op.return_value = dat

        svc = api_service_module.TouchDesignerApiService()
        r = svc.format_dat("/project1/script1")
        assert r["success"] is False
        assert "ruff not found" in r["error"]


class TestLintDats:
    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_batch_lint_aggregation(self, _mock_which, mock_run, api_service_module):
        """Test batch lint with 3 DATs, verify aggregation math."""
        mock_td = api_service_module._mock_td

        # Create 3 DAT nodes
        dats = []
        for name, code in [
            ("script1", "import os\nimport sys\n"),
            ("script2", "x=1\n"),
            ("script3", "print('hello')\n"),
        ]:
            d = MagicMock()
            d.valid = True
            d.path = f"/project1/{name}"
            d.name = name
            d.OPType = "scriptDAT"
            d.text = code
            d.dock = None
            parent_mock = MagicMock()
            parent_mock.path = "/project1"
            d.parent.return_value = parent_mock
            dats.append(d)

        parent = MagicMock()
        parent.valid = True
        parent.OPType = "COMP"
        parent.findChildren.return_value = dats

        def op_side_effect(path):
            if path == "/project1":
                return parent
            for d in dats:
                if d.path == path:
                    return d
            return None

        mock_td.op.side_effect = op_side_effect

        # Simulate ruff returning diagnostics for script1 and script2
        def run_side_effect(cmd, **kwargs):
            # Read the temp file to determine which script this is
            tmp_path = cmd[-1]
            with open(tmp_path, encoding="utf-8") as f:
                content = f.read()

            if "import os" in content:
                # script1: 2 issues (F401 = fixable)
                diag1 = (
                    '{"code":"F401","message":"unused import os",'
                    '"location":{"row":1,"column":1},'
                    '"end_location":{"row":1,"column":10},'
                    '"fix":{"applicability":"safe"}}'
                )
                diag2 = (
                    '{"code":"F401","message":"unused import sys",'
                    '"location":{"row":2,"column":1},'
                    '"end_location":{"row":2,"column":10},'
                    '"fix":{"applicability":"safe"}}'
                )
                return MagicMock(
                    returncode=1,
                    stdout=f"[{diag1},{diag2}]",
                    stderr="",
                )
            elif "x=1" in content:
                # script2: 1 issue (E225 = not fixable)
                diag = (
                    '{"code":"E225","message":"missing whitespace",'
                    '"location":{"row":1,"column":2},'
                    '"end_location":{"row":1,"column":2},'
                    '"fix":null}'
                )
                return MagicMock(
                    returncode=1,
                    stdout=f"[{diag}]",
                    stderr="",
                )
            else:
                # script3: clean
                return MagicMock(returncode=0, stdout="[]", stderr="")

        mock_run.side_effect = run_side_effect

        svc = api_service_module.TouchDesignerApiService()
        r = svc.lint_dats("/project1", purpose="python")

        assert r["success"] is True
        data = r["data"]

        assert data["parentPath"] == "/project1"

        summary = data["summary"]
        assert summary["totalDatsScanned"] == 3
        assert summary["datsWithErrors"] == 2
        assert summary["datsClean"] == 1
        assert summary["totalIssues"] == 3
        assert summary["fixableCount"] == 2
        assert summary["manualCount"] == 1

        # Check severity breakdown
        assert summary["bySeverity"]["error"] == 1  # E225
        assert summary["bySeverity"]["warning"] == 0
        assert summary["bySeverity"]["info"] == 2  # F401 x2

        # Check worst offenders
        assert len(summary["worstOffenders"]) == 2
        assert summary["worstOffenders"][0]["diagnosticCount"] == 2  # script1

        # Check per-DAT results
        assert len(data["results"]) == 3

    def test_parent_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.lint_dats("/bad")
        assert r["success"] is False

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/ruff")
    def test_pattern_filter(self, _mock_which, mock_run, api_service_module):
        """Test that the pattern parameter filters DATs by name."""
        mock_td = api_service_module._mock_td

        d1 = MagicMock()
        d1.valid = True
        d1.path = "/project1/ext_script"
        d1.name = "ext_script"
        d1.OPType = "scriptDAT"
        d1.text = "x = 1\n"
        d1.dock = None
        p = MagicMock()
        p.path = "/project1"
        d1.parent.return_value = p

        d2 = MagicMock()
        d2.valid = True
        d2.path = "/project1/callbacks"
        d2.name = "callbacks"
        d2.OPType = "scriptDAT"
        d2.text = "y = 2\n"
        d2.dock = None
        d2.parent.return_value = p

        parent = MagicMock()
        parent.valid = True
        parent.OPType = "COMP"
        parent.findChildren.return_value = [d1, d2]

        def op_side_effect(path):
            if path == "/project1":
                return parent
            if path == d1.path:
                return d1
            if path == d2.path:
                return d2
            return None

        mock_td.op.side_effect = op_side_effect
        mock_run.return_value = MagicMock(returncode=0, stdout="[]", stderr="")

        svc = api_service_module.TouchDesignerApiService()
        r = svc.lint_dats("/project1", pattern="ext_*", purpose="python")

        assert r["success"] is True
        # Only ext_script matches the pattern
        assert r["data"]["summary"]["totalDatsScanned"] == 1
        assert r["data"]["results"][0]["name"] == "ext_script"


class TestValidateJsonDat:
    def test_node_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_json_dat("/bad")
        assert r["success"] is False

    def test_no_text_attribute(self, api_service_module):
        mock_td = api_service_module._mock_td
        node = MagicMock(spec=[])  # no .text attribute
        node.valid = True
        mock_td.op.return_value = node
        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_json_dat("/project1/data1")
        assert r["success"] is False

    def test_valid_json(self, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/data1"
        dat.name = "data1"
        dat.text = '{"key": "value", "num": 42}'
        mock_td.op.return_value = dat

        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_json_dat("/project1/data1")
        assert r["success"] is True
        data = r.get("data", {})
        assert data["valid"] is True
        assert data["format"] == "json"
        assert data["diagnostics"] == []

    def test_invalid_json_with_line_col(self, api_service_module):
        """Test that invalid JSON returns diagnostics with line/col."""
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/data1"
        dat.name = "data1"
        # This is invalid JSON. Patch yaml to also fail so we get diagnostics.
        dat.text = '{"key": value}'
        mock_td.op.return_value = dat

        # Mock yaml to be unavailable so only JSON is tried
        with patch.dict("sys.modules", {"yaml": None}):
            import importlib

            importlib.reload(sys.modules["mcp.services.api_service"])
            svc = sys.modules["mcp.services.api_service"].TouchDesignerApiService()
            r = svc.validate_json_dat("/project1/data1")

        assert r["success"] is True
        data = r.get("data", {})
        assert data["valid"] is False
        assert len(data["diagnostics"]) >= 1
        diag = data["diagnostics"][0]
        assert "line" in diag
        assert "column" in diag
        assert "message" in diag

    def test_empty_text(self, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/data1"
        dat.name = "data1"
        dat.text = "   "
        mock_td.op.return_value = dat

        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_json_dat("/project1/data1")
        assert r["success"] is True
        data = r.get("data", {})
        assert data["valid"] is True
        assert data["format"] == "unknown"

    def test_valid_yaml_fallback(self, api_service_module):
        """If text is not valid JSON but is valid YAML, report yaml format."""
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/data1"
        dat.name = "data1"
        dat.text = "key: value\nlist:\n  - item1\n  - item2\n"
        mock_td.op.return_value = dat

        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_json_dat("/project1/data1")
        assert r["success"] is True
        data = r.get("data", {})
        # Result depends on yaml availability in test env
        if data["format"] == "yaml":
            assert data["valid"] is True
        else:
            # yaml not installed — falls through to unknown/json error
            assert data["valid"] is False

    @patch.dict("sys.modules", {"yaml": None})
    def test_yaml_unavailable_fallback(self, api_service_module):
        """When yaml is not importable, only JSON validation runs."""
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/data1"
        dat.name = "data1"
        dat.text = "not: json: or: anything"
        mock_td.op.return_value = dat

        # Reload to pick up the yaml import mock
        import importlib

        importlib.reload(api_service_module)

        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_json_dat("/project1/data1")
        assert r["success"] is True
        data = r.get("data", {})
        assert data["valid"] is False
        # Should have at least a JSON diagnostic
        assert len(data["diagnostics"]) >= 1


class TestValidateGlslDat:
    def test_node_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_glsl_dat("/bad")
        assert r["success"] is False

    def test_no_text_attribute(self, api_service_module):
        mock_td = api_service_module._mock_td
        node = MagicMock(spec=[])  # no .text attribute
        node.valid = True
        mock_td.op.return_value = node
        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_glsl_dat("/project1/shader1")
        assert r["success"] is False

    def test_shader_type_from_name_pixel(self, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/myshader_pixel"
        dat.name = "myshader_pixel"
        dat.text = "void main() {}"
        # No connected GLSL op, no glslangValidator
        parent = MagicMock()
        parent.children = []
        dat.parent.return_value = parent
        mock_td.op.return_value = dat

        with patch("mcp.services.api_service.shutil.which", return_value=None):
            svc = api_service_module.TouchDesignerApiService()
            r = svc.validate_glsl_dat("/project1/myshader_pixel")

        assert r["success"] is True
        data = r.get("data", {})
        assert data["shaderType"] == "pixel"
        assert data["validationMethod"] == "none"
        assert data["valid"] is True

    def test_shader_type_from_name_vertex(self, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/myshader_vertex"
        dat.name = "myshader_vertex"
        dat.text = "void main() {}"
        parent = MagicMock()
        parent.children = []
        dat.parent.return_value = parent
        mock_td.op.return_value = dat

        with patch("mcp.services.api_service.shutil.which", return_value=None):
            svc = api_service_module.TouchDesignerApiService()
            r = svc.validate_glsl_dat("/project1/myshader_vertex")

        assert r["success"] is True
        assert r.get("data", {})["shaderType"] == "vertex"

    def test_shader_type_from_name_compute(self, api_service_module):
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/sim_compute"
        dat.name = "sim_compute"
        dat.text = "void main() {}"
        parent = MagicMock()
        parent.children = []
        dat.parent.return_value = parent
        mock_td.op.return_value = dat

        with patch("mcp.services.api_service.shutil.which", return_value=None):
            svc = api_service_module.TouchDesignerApiService()
            r = svc.validate_glsl_dat("/project1/sim_compute")

        assert r["success"] is True
        assert r.get("data", {})["shaderType"] == "compute"

    def test_td_errors_from_connected_glsl_top(self, api_service_module):
        """When a GLSL TOP references the DAT, use its errors() output."""
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/shader_pixel"
        dat.name = "shader_pixel"
        dat.text = "void main() { bad }"

        # Create a GLSL TOP that references this DAT
        glsl_top = MagicMock()
        glsl_top.OPType = "glslTOP"
        glsl_top.errors.return_value = "ERROR: 0:5: undeclared identifier 'bad'"
        # par.pixeldat.eval() returns the DAT node
        pixel_par = MagicMock()
        pixel_par.eval.return_value = dat
        glsl_top.par.pixeldat = pixel_par
        # Ensure other pars don't exist
        glsl_top.par.dat = MagicMock()
        glsl_top.par.dat.eval.return_value = None
        glsl_top.par.glsldat = MagicMock()
        glsl_top.par.glsldat.eval.return_value = None
        glsl_top.par.vertexdat = MagicMock()
        glsl_top.par.vertexdat.eval.return_value = None
        glsl_top.par.computedat = MagicMock()
        glsl_top.par.computedat.eval.return_value = None

        parent = MagicMock()
        parent.children = [glsl_top]
        dat.parent.return_value = parent
        mock_td.op.return_value = dat

        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_glsl_dat("/project1/shader_pixel")

        assert r["success"] is True
        data = r.get("data", {})
        assert data["validationMethod"] == "td_errors"
        assert data["valid"] is False
        assert len(data["diagnostics"]) == 1
        assert data["diagnostics"][0]["line"] == 5
        assert "bad" in data["diagnostics"][0]["message"]

    def test_td_errors_no_errors(self, api_service_module):
        """When GLSL TOP has no errors, report valid."""
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/shader_pixel"
        dat.name = "shader_pixel"
        dat.text = "void main() {}"

        glsl_top = MagicMock()
        glsl_top.OPType = "glslTOP"
        glsl_top.errors.return_value = ""
        pixel_par = MagicMock()
        pixel_par.eval.return_value = dat
        glsl_top.par.pixeldat = pixel_par
        glsl_top.par.dat = MagicMock()
        glsl_top.par.dat.eval.return_value = None
        glsl_top.par.glsldat = MagicMock()
        glsl_top.par.glsldat.eval.return_value = None
        glsl_top.par.vertexdat = MagicMock()
        glsl_top.par.vertexdat.eval.return_value = None
        glsl_top.par.computedat = MagicMock()
        glsl_top.par.computedat.eval.return_value = None

        parent = MagicMock()
        parent.children = [glsl_top]
        dat.parent.return_value = parent
        mock_td.op.return_value = dat

        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_glsl_dat("/project1/shader_pixel")

        assert r["success"] is True
        data = r.get("data", {})
        assert data["validationMethod"] == "td_errors"
        assert data["valid"] is True
        assert data["diagnostics"] == []

    @patch("mcp.services.api_service.subprocess.run")
    @patch("mcp.services.api_service.shutil.which", return_value="/usr/bin/glslangValidator")
    def test_glslang_validator_fallback(self, _mock_which, mock_run, api_service_module):
        """When no GLSL TOP is connected, fall back to glslangValidator."""
        mock_td = api_service_module._mock_td
        dat = MagicMock()
        dat.valid = True
        dat.path = "/project1/shader_pixel"
        dat.name = "shader_pixel"
        dat.text = "void main() { bad }"

        parent = MagicMock()
        parent.children = []  # No GLSL operators
        dat.parent.return_value = parent
        mock_td.op.return_value = dat

        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="ERROR: 0:1: 'bad' : undeclared identifier\n",
            stderr="",
        )

        svc = api_service_module.TouchDesignerApiService()
        r = svc.validate_glsl_dat("/project1/shader_pixel")

        assert r["success"] is True
        data = r.get("data", {})
        assert data["validationMethod"] == "glslangValidator"
        assert data["valid"] is False
        assert len(data["diagnostics"]) >= 1


class TestConfigureInstancing:
    def test_geo_not_found(self, api_service_module):
        mock_td = api_service_module._mock_td
        mock_td.op.return_value = None
        svc = api_service_module.TouchDesignerApiService()
        r = svc.configure_instancing("/bad", "particles")
        assert r["success"] is False

    @patch("td_helpers.network.setup_instancing")
    def test_successful_configure(self, mock_setup, api_service_module):
        mock_td = api_service_module._mock_td
        geo = MagicMock()
        geo.valid = True
        geo.id = 1
        geo.name = "geo1"
        geo.path = "/project1/geo1"
        geo.OPType = "geometryCOMP"
        mock_td.op.return_value = geo

        svc = api_service_module.TouchDesignerApiService()
        r = svc.configure_instancing("/project1/geo1", "particles")
        assert r["success"] is True
        assert r["data"]["instanceOp"] == "particles"
        mock_setup.assert_called_once()
