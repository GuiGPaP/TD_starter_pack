"""Context aggregator — fetches multiple facets for a single TD node.

Each facet is fetched independently; individual failures produce warnings
rather than blocking the entire request.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from utils.result import error_result, success_result

if TYPE_CHECKING:
	from mcp.services.api_service import IApiService
	from utils.types import Result


# Maps user-facing facet names to (service_method_name, kwargs_factory).
# The kwargs_factory receives *node_path* and returns the kwargs dict.
_FACET_DISPATCH: dict[str, tuple[str, Any]] = {
	"parameters": ("get_node_parameter_schema", lambda p: {"node_path": p}),
	"channels": ("get_chop_channels", lambda p: {"node_path": p}),
	"tableInfo": ("get_dat_table_info", lambda p: {"node_path": p}),
	"extensions": (
		"get_comp_extensions",
		lambda p: {"comp_path": p, "include_docs": True},
	),
	"children": ("get_nodes", lambda p: {"parent_path": p, "pattern": "*"}),
	"errors": ("get_node_errors", lambda p: {"node_path": p}),
	"datText": ("get_dat_text", lambda p: {"node_path": p}),
}


def aggregate_context(
	service: IApiService,
	node_path: str,
	include: list[str] | None = None,
) -> Result:
	"""Aggregate multiple context facets for *node_path*.

	Parameters
	----------
	service:
		An object implementing ``IApiService`` (or duck-typed equivalent).
	node_path:
		Absolute path of the target operator, e.g. ``"/project1/geo1"``.
	include:
		List of facet names to fetch.  ``None`` means *all known facets*.
		Unknown names are silently added to warnings.

	Returns
	-------
	Result with ``data = {"nodePath": ..., "facets": {...}, "warnings": [...]}``.
	"""

	if not node_path:
		return error_result("node_path is required")

	requested = list(_FACET_DISPATCH.keys()) if include is None else include

	facets: dict[str, Any] = {}
	warnings: list[str] = []

	for name in requested:
		dispatch = _FACET_DISPATCH.get(name)
		if dispatch is None:
			warnings.append(f"Unknown facet: {name!r}")
			continue

		method_name, kwargs_factory = dispatch
		method = getattr(service, method_name, None)
		if method is None:
			warnings.append(
				f"Service does not support {method_name!r} (facet {name!r})"
			)
			continue

		try:
			result = method(**kwargs_factory(node_path))
			if isinstance(result, dict) and result.get("success"):
				facets[name] = result.get("data")
			else:
				err = (
					result.get("error", "unknown error")
					if isinstance(result, dict)
					else str(result)
				)
				warnings.append(f"Facet {name!r} failed: {err}")
		except Exception as exc:
			warnings.append(f"Facet {name!r} raised: {exc}")

	return success_result({
		"nodePath": node_path,
		"facets": facets,
		"warnings": warnings,
	})
