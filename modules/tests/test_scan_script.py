"""Tests for mcp.services.completion.scan_script — issue #37."""

from mcp.services.completion.scan_script import generate_scan_script


class TestGenerateScanScript:
    def test_compiles_to_valid_python(self):
        script = generate_scan_script()
        compile(script, "<scan_script>", "exec")

    def test_contains_find_children(self):
        script = generate_scan_script()
        assert "findChildren" in script

    def test_contains_result_assignment(self):
        script = generate_scan_script()
        assert "result =" in script or "result=" in script

    def test_custom_root_path(self):
        script = generate_scan_script(root_path="/myRoot")
        assert "/myRoot" in script

    def test_custom_max_depth(self):
        script = generate_scan_script(max_depth=3)
        assert "3" in script

    def test_op_limit_enforcement(self):
        """The script must contain truncation logic based on op_limit."""
        script = generate_scan_script(op_limit=100)
        assert "100" in script
        assert "truncated" in script.lower() or "_truncated" in script

    def test_collects_extensions(self):
        script = generate_scan_script()
        assert "extensions" in script

    def test_collects_custom_pars(self):
        script = generate_scan_script()
        assert "customPars" in script or "customPages" in script

    def test_collects_shortcuts(self):
        script = generate_scan_script()
        assert "shortcuts" in script

    def test_collects_warnings(self):
        script = generate_scan_script()
        assert "warnings" in script

    def test_result_keys(self):
        """The result dict in the script must have all expected keys."""
        script = generate_scan_script()
        expected_keys = (
            "ops", "extensions", "customPars", "shortcuts",
            "warnings", "truncated", "totalFound", "scanned",
        )
        for key in expected_keys:
            assert f'"{key}"' in script, f"Missing key {key!r} in result dict"
