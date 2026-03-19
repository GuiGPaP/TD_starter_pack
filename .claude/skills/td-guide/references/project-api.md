# Project MCP API Reference

This project exposes TouchDesigner functionality through an MCP web server. The API service (`modules/mcp/services/api_service.py`) provides the endpoints that Claude uses to interact with TD.

## Concept Mapping: TD Tasks → MCP Endpoints

| TD Task | MCP Tool | What It Does |
|---------|----------|--------------|
| Inspect TD version, OS, build | `get_td_info` | Returns server version, OS, MCP API version |
| Browse operators in a container | `get_td_nodes` | Lists children of a parent path, optional name pattern filter |
| Inspect a single operator | `get_td_node_parameters` | Returns full parameter dict for a node |
| Check operator errors | `get_td_node_errors` | Collects error messages for node + children (recurse) |
| Create a new operator | `create_td_node` | Creates node under parent path with type, name, initial parameters |
| Delete an operator | `delete_td_node` | Destroys a node at path |
| Set parameters on an operator | `update_td_node_parameters` | Batch-updates parameters by name/value dict |
| Call a method on a node | `exec_node_method` | Invokes any callable method on a node (e.g., `.cook()`, `.save()`) |
| Run arbitrary Python in TD | `execute_python_script` | Executes a Python script string with full `td`, `op`, `ops` access |
| Create Geometry COMP with In/Out | `create_geometry_comp` | Creates geometryCOMP, clears default torus, adds In/Out operators |
| Create feedback loop | `create_feedback_loop` | Creates feedback/process/null_out/const_init chain |
| Configure instancing | `configure_instancing` | Enables instancing, sets instanceop + tx/ty/tz |
| Look up TD Python classes | `get_td_classes` | Lists all members of the `td` module |
| Get class/module details | `get_td_class_details` | Introspects methods and properties of a td class |
| Get Python help text | `get_td_module_help` | Returns `pydoc.render_doc()` output for a module/class |
| Get parameter schema (type, range, menu) | `get_node_parameter_schema` | Returns name, style, default, min/max, menuNames/menuLabels, isOP, readOnly for each par |
| Complete op() path references | `complete_op_paths` | Resolves relative/absolute op('...') forms from a context node, returns matching paths |
| List CHOP channels | `get_chop_channels` | Returns channel names, sample rate, optional min/max/avg stats |
| Preview table DAT content | `get_dat_table_info` | Returns dimensions + sample rows (raw cells, no type inference) |
| List COMP extensions | `get_comp_extensions` | Returns extension classes with method signatures and properties |
| Read DAT text | `get_dat_text` | Returns the .text content of a DAT operator |
| Write DAT text | `set_dat_text` | Writes .text content to a DAT operator |
| Lint DAT code | `lint_dat` | Runs ruff on DAT .text, optional fix/dry-run with diff |
| Batch lint DATs | `lint_dats` | Lint all Python DATs under a parent with aggregated report |
| Format DAT code | `format_dat` | Auto-format Python with ruff format, optional dry-run |
| Typecheck DAT code | `typecheck_dat` | Run pyright with td.pyi stubs on DAT .text |
| Validate JSON/YAML DAT | `validate_json_dat` | Validate JSON or YAML content with structured diagnostics |
| Validate GLSL DAT | `validate_glsl_dat` | Validate GLSL shader syntax with structured diagnostics |
| Discover DAT candidates | `discover_dat_candidates` | Classifies DATs under a parent by kind (python/glsl/text/data) |

## Usage Notes

### `execute_python_script` — Fallback for Complex Operations

For standard composite patterns (geometry comp, feedback loop, instancing), prefer the dedicated high-level MCP tools above (`create_geometry_comp`, `create_feedback_loop`, `configure_instancing`).

When those tools are too limited, `execute_python_script` runs arbitrary Python inside TD. It provides:
- `op`, `ops`, `td`, `project` in the namespace
- **`parent`** — injected as a **string path** (e.g., `"/project1"`), NOT an OP object. `parent.create(...)` will crash. Use `op('/project1/base1').create(...)` instead.
- stdout/stderr capture
- Auto-extraction of the last expression as `result`

Use this for complex operations like chaining multiple operators, setting expression modes, or reading data that isn't exposed through other endpoints.

### `get_td_nodes` — Browsing the Network

```
parent_path: "/project1/base1"
pattern: "glsl*"              # Optional name filter
include_properties: false     # Set true for full parameter dump (slower)
```

Returns lightweight summaries by default (id, name, path, opType). Pass `include_properties: true` for full parameter values.

### `create_td_node` — Creating Operators

```
parent_path: "/project1/base1"
node_type: "gridSOP"
node_name: "grid1"            # Optional, auto-incremented if taken
parameters: {"sizex": 2.0}   # Optional initial parameters
```

Note: this does NOT set `viewer = True` or handle docked operators. For full setup, follow up with `execute_python_script` or `update_td_node_parameters`.

### `update_td_node_parameters` — Setting Parameters

```
node_path: "/project1/base1/glsl1"
properties: {"vec0name": "uTime", "vec0valuex": 1.0}
```

Sets parameters by name. Returns lists of `updated` and `failed` properties.

### `get_td_node_errors` — Error Checking

```
node_path: "/project1/base1"
```

Uses TD's `errors(recurse=True)` internally. Remember: error cache updates on frame boundaries — always check errors in a **separate call** after making fixes.

### `exec_node_method` — Calling Node Methods

```
node_path: "/project1/base1/glsl1"
method: "cook"
args: []
kwargs: {"force": true}
```

Can invoke any callable method on a node. Useful for `.cook(force=True)`, `.save()`, `.pulse()`, etc.

## Architecture Overview

```
modules/
  mcp/
    services/
      api_service.py      ← Main API service (this reference)
    ...
```

The `TouchDesignerApiService` class implements all endpoints. It's instantiated as a singleton `api_service` at module level.

## Semantic Introspection Tools

These tools expose TD runtime state so Claude stops guessing parameter names, operator paths, and data structures.

### `get_node_parameter_schema` — Parameter Discovery

```
nodePath: "/project1/noise1"
pattern: "instance*"          # Optional glob filter (default "*")
```

Returns for each parameter: `name`, `label`, `style` (Float/Int/Menu/…), `default`, `val`, `min`, `max`, `clampMin`, `clampMax`, `menuNames`, `menuLabels`, `isOP`, `readOnly`, `page`.

**Use before** setting parameters — eliminates guessing param names and valid ranges.

### `complete_op_paths` — Operator Path Completion

```
contextNodePath: "/project1/base1/script1"
prefix: "noise"               # or "./sub", "../foo", "/project1/geo*"
limit: 50                     # Max results (default 50)
```

Resolves `op('...')` forms as TD would: sibling by name, `./child`, `../parent_sibling`, absolute `/path`, multi-level `sub/foo`. Returns `{path, name, opType, family, relativeRef}` per match.

### `get_chop_channels` — CHOP Channel Inspection

```
nodePath: "/project1/noise1"
pattern: "t*"                 # Optional channel name filter
includeStats: true            # Add min/max/avg per channel
limit: 100                    # Max channels (default 100)
```

Returns `numChannels`, `numSamples`, `sampleRate`, and channel list. With `includeStats=true`, each channel adds `minVal`, `maxVal`, `avgVal`.

### `get_dat_table_info` — Table DAT Preview

```
nodePath: "/project1/table1"
maxPreviewRows: 6             # First N rows (default 6)
maxCellChars: 200             # Truncate cells (default 200)
```

Returns `numRows`, `numCols`, raw `sampleData` (no header/type inference), and truncation flags.

### `get_comp_extensions` — COMP Extension Discovery

```
compPath: "/project1/base1"
includeDocs: true             # Add method docstrings (truncated to 500 chars)
maxMethods: 50                # Max methods per extension (default 50)
```

Returns each extension's `name`, `methodCount`, `propertyCount`, and lists of `{name, signature}` methods and `{name, type}` properties.
