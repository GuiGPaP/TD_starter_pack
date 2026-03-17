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
| Look up TD Python classes | `get_td_classes` | Lists all members of the `td` module |
| Get class/module details | `get_td_class_details` | Introspects methods and properties of a td class |
| Get Python help text | `get_td_module_help` | Returns `pydoc.render_doc()` output for a module/class |

## Usage Notes

### `execute_python_script` — The Escape Hatch

When other endpoints are too limited, `execute_python_script` runs arbitrary Python inside TD. It provides:
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
