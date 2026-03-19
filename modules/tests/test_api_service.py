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
