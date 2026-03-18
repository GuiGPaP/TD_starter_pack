"""Tests for utils.result module."""

from utils.result import error_result, success_result


class TestSuccessResult:
    def test_basic(self):
        r = success_result("hello")
        assert r == {"success": True, "data": "hello", "error": None}

    def test_none_data(self):
        r = success_result(None)
        assert r["success"] is True
        assert r["data"] is None

    def test_dict_data(self):
        r = success_result({"key": "val"})
        assert r["data"] == {"key": "val"}

    def test_list_data(self):
        r = success_result([1, 2, 3])
        assert r["data"] == [1, 2, 3]

    def test_nested_data(self):
        data = {"a": [{"b": 1}]}
        r = success_result(data)
        assert r["data"] == data


class TestErrorResult:
    def test_basic(self):
        r = error_result("bad thing")
        assert r == {"success": False, "data": None, "error": "bad thing"}

    def test_with_metadata(self):
        r = error_result("fail", {"code": 42})
        assert r["success"] is False
        assert r["error"] == "fail"
        assert r["code"] == 42  # type: ignore[typeddict-item]

    def test_without_metadata(self):
        r = error_result("oops")
        assert "code" not in r
