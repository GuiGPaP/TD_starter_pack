"""Tests for mcp.services.completion.builtin_stubs — issue #38."""

from mcp.services.completion.builtin_stubs import get_builtin_stubs


class TestGetBuiltinStubs:
    def test_returns_dict(self):
        stubs = get_builtin_stubs()
        assert isinstance(stubs, dict)

    def test_has_required_top_level_keys(self):
        stubs = get_builtin_stubs()
        assert "common_pars" in stubs
        assert "td_module" in stubs
        assert "classes" in stubs

    def test_common_pars_structure(self):
        pars = get_builtin_stubs()["common_pars"]
        assert isinstance(pars, dict)
        # Must have at least Transform and Common
        assert "Transform" in pars
        assert "Common" in pars
        for page_name, entries in pars.items():
            assert isinstance(entries, list), f"{page_name} should be a list"
            for entry in entries:
                assert "name" in entry, f"Entry in {page_name} missing 'name'"
                assert "type" in entry, f"Entry in {page_name} missing 'type'"
                assert "desc" in entry, f"Entry in {page_name} missing 'desc'"

    def test_td_module_structure(self):
        td_mod = get_builtin_stubs()["td_module"]
        assert isinstance(td_mod, list)
        assert len(td_mod) >= 10
        for entry in td_mod:
            assert "name" in entry
            assert "type" in entry
            assert "desc" in entry

    def test_classes_structure(self):
        classes = get_builtin_stubs()["classes"]
        assert isinstance(classes, dict)
        # Must have core classes
        for cls_name in ("Par", "OP", "COMP", "TOP", "CHOP", "SOP", "DAT", "Cell", "Channel"):
            assert cls_name in classes, f"Missing class {cls_name!r}"
            cls = classes[cls_name]
            assert "desc" in cls
            assert "key_attrs" in cls
            assert isinstance(cls["key_attrs"], list)
            assert len(cls["key_attrs"]) > 0

    def test_no_duplicate_par_names(self):
        """No duplicate parameter names within a single page."""
        pars = get_builtin_stubs()["common_pars"]
        for page_name, entries in pars.items():
            names = [e["name"] for e in entries]
            assert len(names) == len(set(names)), f"Duplicate par names in {page_name}"

    def test_no_duplicate_td_module_names(self):
        td_mod = get_builtin_stubs()["td_module"]
        names = [e["name"] for e in td_mod]
        assert len(names) == len(set(names)), "Duplicate names in td_module"

    def test_no_duplicate_class_names(self):
        classes = get_builtin_stubs()["classes"]
        # classes is a dict so keys are unique by definition — just verify non-empty
        assert len(classes) > 0
