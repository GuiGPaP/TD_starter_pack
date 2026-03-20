"""Tests for mcp.services.completion.indexer — issue #39."""

from mcp.services.completion.indexer import build_index


def _make_scan_data(**overrides):
    """Create minimal scan data dict."""
    data = {
        "ops": [
            {"path": "/project1/geo1", "opType": "geometryCOMP", "family": "COMP"},
            {"path": "/project1/geo1/torus1", "opType": "torusSOP", "family": "SOP"},
            {"path": "/project1/noise1", "opType": "noiseTOP", "family": "TOP"},
        ],
        "extensions": {
            "/project1/geo1": [
                {"name": "GeoExt", "methods": ["Init", "Update"]},
            ],
        },
        "customPars": {
            "/project1/geo1": [
                {"name": "Speed", "label": "Speed", "style": "Float"},
            ],
        },
        "shortcuts": {"project": "/project1"},
        "warnings": [],
        "truncated": False,
        "totalFound": 3,
        "scanned": 3,
    }
    data.update(overrides)
    return data


class TestBuildIndex:
    def test_returns_expected_keys(self):
        r = build_index(_make_scan_data())
        assert "markdown" in r
        assert "stats" in r
        assert "warnings" in r
        assert "truncated" in r

    def test_markdown_contains_sections(self):
        md = build_index(_make_scan_data())["markdown"]
        assert "# Builtins Anti-Erreurs" in md
        assert "# Project Structure" in md
        assert "# Extensions" in md
        assert "# Custom Parameters" in md
        assert "# Shortcuts" in md

    def test_markdown_contains_op_paths(self):
        md = build_index(_make_scan_data())["markdown"]
        assert "/project1/geo1" in md
        assert "geometryCOMP" in md

    def test_compact_shorter_than_full(self):
        data = _make_scan_data()
        compact_md = build_index(data, mode="compact")["markdown"]
        full_md = build_index(data, mode="full")["markdown"]
        assert len(compact_md) <= len(full_md)

    def test_stats_accuracy(self):
        stats = build_index(_make_scan_data())["stats"]
        assert stats["opCount"] == 3
        assert stats["compCount"] == 1
        assert stats["extensionCount"] == 1
        assert stats["warningCount"] == 0

    def test_warnings_in_stats(self):
        data = _make_scan_data(warnings=["error on /project1/bad: cook error"])
        stats = build_index(data)["stats"]
        assert stats["warningCount"] == 1

    def test_truncated_flag_passthrough(self):
        data = _make_scan_data(truncated=True, totalFound=600, scanned=500)
        r = build_index(data)
        assert r["truncated"] is True
        assert "Truncated" in r["markdown"]

    def test_empty_scan_data(self):
        empty = {
            "ops": [], "extensions": {}, "customPars": {},
            "shortcuts": {}, "warnings": [], "truncated": False,
            "totalFound": 0, "scanned": 0,
        }
        r = build_index(empty)
        assert r["stats"]["opCount"] == 0
        assert "No operators found" in r["markdown"]

    def test_builtins_section_always_present(self):
        """Builtins section is present even with empty scan data."""
        empty = {
            "ops": [], "extensions": {}, "customPars": {},
            "shortcuts": {}, "warnings": [], "truncated": False,
            "totalFound": 0, "scanned": 0,
        }
        md = build_index(empty)["markdown"]
        assert "# Builtins Anti-Erreurs" in md
        assert "td Module" in md
        assert "Key Classes" in md

    def test_compact_limits_ops_display(self):
        """Compact mode should limit displayed ops to 50."""
        many_ops = [
            {"path": f"/project1/op{i}", "opType": "nullTOP", "family": "TOP"}
            for i in range(100)
        ]
        data = _make_scan_data(ops=many_ops)
        md = build_index(data, mode="compact")["markdown"]
        assert "50 more" in md

    def test_full_mode_shows_all_ops(self):
        many_ops = [
            {"path": f"/project1/op{i}", "opType": "nullTOP", "family": "TOP"}
            for i in range(100)
        ]
        data = _make_scan_data(ops=many_ops)
        md = build_index(data, mode="full")["markdown"]
        assert "/project1/op99" in md

    def test_no_extensions_section_when_empty(self):
        data = _make_scan_data(extensions={})
        md = build_index(data)["markdown"]
        assert "# Extensions" not in md

    def test_no_warnings_section_when_empty(self):
        data = _make_scan_data(warnings=[])
        md = build_index(data)["markdown"]
        assert "# Warnings" not in md
