"""Hardcoded stubs for common TD builtins, classes, and parameters.

This is a pure data module with no TD runtime dependency.  It provides
the agent with a compact reference of the most frequently used TD
constructs so it can avoid hallucinating parameter names and API calls.
"""

from __future__ import annotations

from typing import Any


def get_builtin_stubs() -> dict[str, Any]:
	"""Return a dict of builtin TD stubs organized by category."""

	return {
		"common_pars": _COMMON_PARS,
		"td_module": _TD_MODULE,
		"classes": _CLASSES,
	}


# ── Common parameter pages ──────────────────────────────────────────

_COMMON_PARS: dict[str, list[dict[str, str]]] = {
	"Transform": [
		{"name": "tx", "type": "float", "desc": "Translate X"},
		{"name": "ty", "type": "float", "desc": "Translate Y"},
		{"name": "tz", "type": "float", "desc": "Translate Z"},
		{"name": "rx", "type": "float", "desc": "Rotate X"},
		{"name": "ry", "type": "float", "desc": "Rotate Y"},
		{"name": "rz", "type": "float", "desc": "Rotate Z"},
		{"name": "sx", "type": "float", "desc": "Scale X"},
		{"name": "sy", "type": "float", "desc": "Scale Y"},
		{"name": "sz", "type": "float", "desc": "Scale Z"},
	],
	"Common": [
		{"name": "display", "type": "bool", "desc": "Display flag"},
		{"name": "render", "type": "bool", "desc": "Render flag"},
		{"name": "bypass", "type": "bool", "desc": "Bypass flag"},
		{"name": "lock", "type": "bool", "desc": "Lock flag"},
		{"name": "viewer", "type": "bool", "desc": "Viewer active"},
	],
	"TOP_Resolution": [
		{"name": "resolutionw", "type": "int", "desc": "Resolution width"},
		{"name": "resolutionh", "type": "int", "desc": "Resolution height"},
		{"name": "outputresolution", "type": "menu", "desc": "Output resolution mode"},
		{"name": "format", "type": "menu", "desc": "Pixel format"},
	],
	"CHOP_Common": [
		{"name": "rate", "type": "float", "desc": "Sample rate"},
		{"name": "length", "type": "float", "desc": "Channel length"},
		{"name": "chanscope", "type": "str", "desc": "Channel scope pattern"},
	],
}

# ── td module top-level functions/attributes ─────────────────────────

_TD_MODULE: list[dict[str, str]] = [
	{"name": "op()", "type": "function", "desc": "Get operator by path or shortcut"},
	{"name": "ops()", "type": "function", "desc": "Get multiple operators by pattern"},
	{"name": "run()", "type": "function", "desc": "Schedule a script to run later"},
	{"name": "absTime", "type": "AbsTime", "desc": "Absolute time object (frame, seconds)"},
	{"name": "project.paths", "type": "Paths", "desc": "Project path shortcuts"},
	{"name": "project.name", "type": "str", "desc": "Current project file name"},
	{"name": "project.folder", "type": "str", "desc": "Current project folder path"},
	{"name": "me", "type": "OP", "desc": "The current operator (in callbacks/extensions)"},
	{"name": "parent()", "type": "COMP", "desc": "The parent COMP of current OP"},
	{"name": "ext", "type": "object", "desc": "Access extensions on the current COMP"},
]

# ── Key TD classes ───────────────────────────────────────────────────

_CLASSES: dict[str, dict[str, str | list[str]]] = {
	"Par": {
		"desc": "Parameter object",
		"key_attrs": ["val", "eval()", "expr", "mode", "name", "label", "default", "min", "max"],
	},
	"OP": {
		"desc": "Base operator class",
		"key_attrs": [
			"path", "name", "parent()", "OPType", "family",
			"cook()", "destroy()", "copy()", "pars()", "errors()",
			"valid", "id", "inputs", "outputs",
		],
	},
	"COMP": {
		"desc": "Component operator — contains children",
		"key_attrs": [
			"findChildren()", "create()", "customPages", "extensions",
			"isCOMP", "currentChild", "par",
		],
	},
	"TOP": {
		"desc": "Texture operator",
		"key_attrs": ["width", "height", "numpixels()", "sample()", "cudaMemory()"],
	},
	"CHOP": {
		"desc": "Channel operator",
		"key_attrs": ["numChans", "numSamples", "chan()", "eval()", "channels"],
	},
	"SOP": {
		"desc": "Surface operator",
		"key_attrs": ["numPoints", "numPrims", "numVertices", "points", "prims"],
	},
	"DAT": {
		"desc": "Data operator",
		"key_attrs": [
			"text", "numRows", "numCols", "row()", "col()",
			"cell()", "appendRow()", "appendCol()",
		],
	},
	"Cell": {
		"desc": "DAT table cell",
		"key_attrs": ["val", "row", "col"],
	},
	"Channel": {
		"desc": "CHOP channel",
		"key_attrs": ["name", "vals", "eval()", "index"],
	},
	"Row": {
		"desc": "DAT row accessor",
		"key_attrs": ["val", "vals"],
	},
	"Col": {
		"desc": "DAT column accessor",
		"key_attrs": ["val", "vals"],
	},
}
