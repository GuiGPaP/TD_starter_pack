"""Tests for utils.serialization module."""

from unittest.mock import MagicMock

from utils.serialization import safe_serialize


class TestSafeSerializePrimitives:
    def test_none(self):
        assert safe_serialize(None) is None

    def test_int(self):
        assert safe_serialize(42) == 42

    def test_float(self):
        assert safe_serialize(3.14) == 3.14

    def test_bool(self):
        assert safe_serialize(True) is True

    def test_str(self):
        assert safe_serialize("hello") == "hello"


class TestSafeSerializeCollections:
    def test_list(self):
        assert safe_serialize([1, "a", None]) == [1, "a", None]

    def test_tuple(self):
        assert safe_serialize((1, 2)) == [1, 2]

    def test_dict(self):
        assert safe_serialize({"a": 1, "b": "x"}) == {"a": 1, "b": "x"}

    def test_nested(self):
        data = {"items": [{"val": 1}, {"val": 2}]}
        assert safe_serialize(data) == data

    def test_dict_key_coerced_to_str(self):
        assert safe_serialize({1: "a"}) == {"1": "a"}


class TestSafeSerializeEval:
    def test_eval_returning_primitive(self):
        obj = MagicMock(spec=[])
        obj.eval = MagicMock(return_value=42)
        assert safe_serialize(obj) == 42

    def test_eval_returning_object_with_path(self):
        inner = MagicMock()
        inner.path = "/project1/geo1"
        obj = MagicMock(spec=[])
        obj.eval = MagicMock(return_value=inner)
        assert safe_serialize(obj) == "/project1/geo1"

    def test_eval_raises_falls_back_to_str(self):
        obj = MagicMock(spec=[])
        obj.eval = MagicMock(side_effect=RuntimeError("boom"))
        result = safe_serialize(obj)
        assert isinstance(result, str)


class TestSafeSerializePath:
    def test_object_with_path(self):
        obj = MagicMock(spec=["path"])
        obj.path = "/project1/noise1"
        # Remove eval so it doesn't match the eval branch
        del obj.eval
        assert safe_serialize(obj) == "/project1/noise1"


class TestSafeSerializePage:
    def test_page_with_name(self):
        obj = MagicMock()
        obj.__class__ = type("Page", (), {})  # pyright: ignore[reportAttributeAccessIssue]
        obj.name = "Default"
        # Remove eval/path so it hits the Page branch
        del obj.eval
        del obj.path
        assert safe_serialize(obj) == "Page:Default"


class TestSafeSerializeDict:
    def test_object_with_dict(self):
        class Foo:
            def __init__(self):
                self.x = 1
                self.y = "two"

        result = safe_serialize(Foo())
        assert result == {"x": 1, "y": "two"}


class TestSafeSerializeFallback:
    def test_fallback_to_str(self):
        # An object with no special attributes → str()
        result = safe_serialize(object())
        assert isinstance(result, str)
