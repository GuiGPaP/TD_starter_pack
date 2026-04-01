"""
TouchDesigner MCP Web Server Serialization Utilities
Provides JSON serialization functionality for objects
"""

from typing import Any


def _serialize_result(obj: Any) -> Any:
    """Serialize a Result dataclass."""
    result_dict: dict[str, Any] = {"success": obj.success}
    if obj.success and obj.data is not None:
        result_dict["data"] = safe_serialize(obj.data)
    elif not obj.success and obj.error is not None:
        result_dict["error"] = str(obj.error)
    return result_dict


def _serialize_evaluable(obj: Any) -> Any:
    """Serialize a TD parameter-like object that has an .eval() method."""
    try:
        val = obj.eval()
        if hasattr(val, "path") and isinstance(getattr(val, "path", None), str):
            return val.path  # pyright: ignore[reportAttributeAccessIssue]
        return val
    except Exception:
        return str(obj)


def safe_serialize(obj: Any) -> Any:
    if obj is None:
        return None

    if isinstance(obj, (int, float, bool, str)):
        return obj

    if isinstance(obj, (list, tuple)):
        return [safe_serialize(item) for item in obj]

    if isinstance(obj, dict):
        return {str(k): safe_serialize(v) for k, v in obj.items()}

    # Result dataclass
    cls_name = getattr(type(obj), "__name__", "")
    if cls_name == "Result" and hasattr(obj, "success") and hasattr(obj, "data"):
        return _serialize_result(obj)

    # TD parameter-like with .eval()
    if hasattr(obj, "eval") and callable(obj.eval):
        return _serialize_evaluable(obj)

    # TD operator-like with .path
    if hasattr(obj, "path") and isinstance(getattr(obj, "path", None), str):
        return obj.path

    # TD Page object
    if cls_name == "Page":
        return f"Page:{obj.name}" if hasattr(obj, "name") else str(obj)

    # Generic object with __dict__
    if hasattr(obj, "__dict__"):
        try:
            return {k: safe_serialize(v) for k, v in obj.__dict__.items()}
        except Exception:
            return str(obj)

    return str(obj)
