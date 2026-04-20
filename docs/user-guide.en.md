# TD Starter Pack — User Guide

[Version francaise](user-guide.md)

## Table of contents

- [Operating modes](#operating-modes)
- [MCP Tools](#mcp-tools)
- [MCP Resources](#mcp-resources)
- [MCP Prompts](#mcp-prompts)
- [Security modes](#security-modes)
- [Audit log](#audit-log)
- [Operator search](#operator-search)
- [Operator comparison](#operator-comparison)
- [TD Project Catalogue](#td-project-catalogue)
- [Version compatibility](#version-compatibility)
- [Claude Skills](#claude-skills)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Operating modes

The MCP server runs in two auto-detected modes:

### Docs-only mode (no TouchDesigner)

The server starts immediately without waiting for TD. Offline tools are available:
- Operator, GLSL pattern, asset, and project search
- Side-by-side operator comparison
- Knowledge catalogue browsing (operators, Python modules)
- Scan and search your TD project library
- Script analysis and preview (without execution)
- Audit log viewing

### Live mode (with TouchDesigner)

When TD is connected (port 9981 by default), all tools become available:
- Node creation, modification, deletion
- Python script execution in TD (with security modes)
- DAT linting, formatting, validation
- Asset and GLSL pattern deployment
- Project packaging (manifest, README, thumbnail generation)

Mode transitions are logged to stderr. Use `get_health` to check connection status.

---

## MCP Tools

### Health & Connection

| Tool | Mode | Description |
|------|------|-------------|
| `get_health` | offline | Check TD connection: online, build, latency, compatibility |
| `wait_for_td` | offline | Wait for TD to respond (timeout 1-120s, default 30s) |
| `get_capabilities` | offline | Server capabilities: mode, installed tools (ruff, pyright) |
| `get_td_info` | live | TD environment info: version, OS, build |

### Search & Discovery

| Tool | Mode | Description |
|------|------|-------------|
| `search_operators` | offline | Scored search across the local operator catalogue. Filters: family, TD version |
| `compare_operators` | offline | Side-by-side comparison of 2 operators (common/unique params, version) |
| `refresh_operator_catalog` | live | Generate the local catalogue from TouchDesigner runtime introspection |
| `index_td_offline_help` | offline | Index the user's local TouchDesigner OfflineHelp folder into the cache |
| `search_glsl_patterns` | offline | Search GLSL patterns by type, difficulty, tags |
| `search_td_assets` | offline | Search reusable .tox assets |
| `describe_td_tools` | offline | Manifest of all available MCP tools |

### Node Management

| Tool | Mode | Description |
|------|------|-------------|
| `create_td_node` | live | Create a node (auto-positioned if x/y omitted) |
| `delete_td_node` | live | Delete a node |
| `get_td_nodes` | live | List nodes under a parent |
| `get_td_node_parameters` | live | Read node parameters |
| `update_td_node_parameters` | live | Modify node parameters |
| `get_td_node_errors` | live | Check errors on a node and its children |

### Python Execution

| Tool | Mode | Description |
|------|------|-------------|
| `execute_python_script` | live | Run Python in TD with security modes and preview |
| `exec_node_method` | live | Call a Python method on a specific node |
| `get_exec_log` | offline | View the execution audit log |

### DAT Operators

| Tool | Mode | Description |
|------|------|-------------|
| `get_dat_text` | live | Read DAT text content |
| `set_dat_text` | live | Write content to a DAT |
| `lint_dat` | live | Lint a Python DAT with ruff (optional auto-fix) |
| `lint_dats` | live | Batch lint all Python DATs under a parent |
| `typecheck_dat` | live | Typecheck a DAT with pyright + td.pyi stubs |
| `format_dat` | live | Format a DAT with ruff format |
| `validate_glsl_dat` | live | Validate GLSL shader code in a DAT |
| `validate_json_dat` | live | Validate JSON/YAML in a DAT |
| `discover_dat_candidates` | live | Discover DATs under a parent (python, glsl, text, data) |

### Network Assembly

| Tool | Mode | Description |
|------|------|-------------|
| `create_geometry_comp` | live | Create a Geometry COMP with In/Out operators |
| `create_feedback_loop` | live | Create a feedback TOP loop (init, feedback, process, out) |
| `configure_instancing` | live | Configure GPU instancing on a Geometry COMP |

### Deployment

| Tool | Mode | Description |
|------|------|-------------|
| `deploy_td_asset` | live | Deploy a .tox asset into the project (dry-run, force) |
| `deploy_glsl_pattern` | live | Deploy a GLSL pattern (creates ops, injects code, wires) |

### Project Catalogue

| Tool | Mode | Description |
|------|------|-------------|
| `package_project` | live | Generate a `.td-catalog.json` manifest, `.td-catalog.md` README, and `.td-catalog.png` thumbnail (best-effort) for the open TD project |
| `scan_projects` | offline | Scan a directory for .toe files and list indexed vs non-indexed |
| `search_projects` | offline | Scored search across catalogued manifests by name, tags, description |

### Introspection

| Tool | Mode | Description |
|------|------|-------------|
| `get_node_parameter_schema` | live | Parameter schema (type, range, menu, default) |
| `complete_op_paths` | live | Auto-complete op() path references |
| `get_chop_channels` | live | CHOP channels with statistics |
| `get_dat_table_info` | live | Table DAT dimensions and preview |
| `get_comp_extensions` | live | COMP extension methods and properties |
| `get_td_context` | live | Aggregated node context (params, channels, errors...) |
| `index_td_project` | live | Project index for code completion |
| `get_td_classes` | offline | List of TouchDesigner Python classes |
| `get_td_class_details` | offline | Class details (methods, properties) |
| `get_td_module_help` | offline | Python help() text for a module |
| `get_glsl_pattern` | offline | GLSL pattern details with source code |
| `get_td_asset` | offline | Asset details with README |

---

## MCP Resources

Resources accessible via the MCP protocol (auto-read by clients):

| URI | Description |
|-----|-------------|
| `td://modules` | Index of documented Python modules |
| `td://modules/{id}` | Module detail (e.g., `td://modules/tdfunctions`) |
| `td://operators` | Index of operators from the user's local cache |
| `td://operators/{id}` | Operator detail from the local cache, enriched with live data when TD is connected |

---

## MCP Prompts

Pre-defined prompts to guide Claude through common tasks:

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| Search node | nodeName, nodeFamily?, nodeType? | Fuzzy node search |
| Check node errors | nodePath | Inspect node errors |
| Node connection | — | Guide for connecting nodes |

---

## Security modes

`execute_python_script` supports 3 security modes via the `mode` parameter. If omitted, the server uses `safe-write`.

### read-only

Allows: parameter reads, introspection, queries, `print()`, `len()`, `dir()`.

Blocks: parameter assignment (`.par.x = ...`), `.create()`, `.connect()`, `.text = ...`, and everything blocked in safe-write.

### safe-write (default)

Allows: everything read-only allows + node creation, parameter modification, connections.

Blocks: `.destroy()`, filesystem access (`os.remove`, `shutil`, `open('w')`), dynamic execution (`exec()`, `eval()`), network (`socket`, `urllib`), `subprocess`, `sys.exit()`.

### full-exec

Unrestricted execution. Required for filesystem writes, subprocesses, dynamic imports/execution, networking, exits, and destructive node operations. Use only for local projects you trust.

### Preview

`preview=true` analyzes the script without executing:

```
execute_python_script(
  script="op('/project1').par.tx = 5",
  mode="read-only",
  preview=true
)
```

Returns: status (ALLOWED/BLOCKED), required mode, violations with line numbers, confidence level (high/medium/low).

### Limitations

Analysis is pattern-based, not a full Python AST. `safe-write` and `read-only` are usage guard rails, not a security sandbox. Do not expose the TD WebServer port or MCP server to untrusted clients.

---

## Audit log

Every call to `execute_python_script` is logged in an in-memory ring buffer (max 100 entries). The log is lost on server restart.

### Querying the log

```
get_exec_log(limit=10)
get_exec_log(outcome="blocked")
get_exec_log(mode="read-only")
```

### Entry contents

- Monotonic ID, timestamp
- Script (truncated to 500 chars, secrets redacted)
- Mode used, preview flag
- Outcome: executed, blocked, previewed, error
- Execution duration
- Detected violations (if any)

### Automatic redaction

- Windows paths with usernames: `C:\Users\xxx\...` masked
- Tokens and API keys: `key=`, `token:` patterns masked

---

## Operator search

The operator catalogue is not bundled with the package. Generate it locally with `refresh_operator_catalog` when TouchDesigner is connected, then add descriptions from your installation with `index_td_offline_help` if the OfflineHelp folder is available. Do not commit or redistribute generated OfflineHelp or Operator Snippets caches.

### Scored search

```
search_operators(query="noise", family="TOP", maxResults=5)
```

Scoring: name/id (100 pts), title (90), description (50), keywords (30), aliases (30), family (20). Exact match bonus (+50), starts-with bonus (+25).

### Multi-term

All terms must match (AND logic). If 0 results, automatic fallback to OR.

### Fuzzy matching

For terms > 3 characters, Levenshtein matching at 50% reduced score.

### Filters

- `family`: TOP, CHOP, SOP, COMP, DAT, MAT
- `version`: filters operators unavailable in the target TD version

---

## Operator comparison

```
compare_operators(op1="noise-top", op2="noise-chop", detailLevel="detailed")
```

Returns: common and unique parameters, family, parameter count, version compatibility, descriptions. Works offline (static data) and better online (live enriched parameters).

---

## TD Project Catalogue

A cataloguing system to organize and find your TouchDesigner projects.

### Package a project

With a `.toe` open in TD:

```
package_project(tags=["feedback", "glsl"], author="MyName")
```

Generates 3 sidecar files next to the `.toe`:
- `{name}.td-catalog.json` — manifest with metadata (operators, components, tags, TD version)
- `{name}.td-catalog.md` — auto-generated README
- `{name}.td-catalog.png` — thumbnail from the first TOP with output (best-effort, may fail without blocking)

### Scan a directory

```
scan_projects(rootDir="C:/Users/xxx/Documents/TouchDesigner")
```

Lists all `.toe` files found and indicates which ones have a manifest (indexed) or not.

### Search projects

```
search_projects(query="feedback", rootDir="C:/Users/xxx/Documents/TouchDesigner")
search_projects(query="", rootDir="...", tags=["glsl"])
```

Scored search by name, tags, description across catalogued manifests.

---

## Version compatibility

### Version manifest

The server tracks TD versions 2020 through 2025 with Python versions and support status. Current stable: **TD 2025**.

### Per-operator data

Each operator in the catalogue may have:
- `addedIn`: version when added
- `deprecatedSince`: deprecation version
- `removedIn`: removal version
- `suggestedReplacement`: replacement operator

### Automatic warnings

Search results include compatibility status (compatible, deprecated, unavailable) based on the connected TD version.

---

## Claude Skills

Specialized guides loaded automatically by Claude Code:

| Skill | Usage |
|-------|-------|
| `td-guide` | TD network, operators, layout, rendering, data conversion |
| `td-glsl` | Pixel shaders, GLSL TOP, 2D effects, generative textures |
| `td-glsl-vertex` | Vertex shaders, GLSL MAT, 3D materials, displacement |
| `td-pops` | Compute shaders, particles, GLSL POP, SSBO |
| `td-python` | TDFunctions, TDJSON, TDStoreTools, TDResources |
| `td-lint` | Python linting, ruff, DAT code quality |
| `td-context` | Project index, code completion, per-node context |

---

## Configuration

### .mcp.json (Claude Code — included in repo)

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["./_mcp_server/dist/cli.js"],
      "env": { "TD_WEB_SERVER_PORT": "9981" }
    }
  }
}
```

### Claude Desktop (absolute path)

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["C:/path/to/TD_starter_pack/_mcp_server/dist/cli.js"],
      "env": { "TD_WEB_SERVER_PORT": "9981" }
    }
  }
}
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TD_WEB_SERVER_HOST` | `http://127.0.0.1` | TD WebServer host |
| `TD_WEB_SERVER_PORT` | `9981` | TD WebServer port |
| `TD_MCP_KNOWLEDGE_PATH` | auto | Knowledge base path override |
| `TD_MCP_GLSLANG_PATH` | auto | glslangValidator path override |

---

## Troubleshooting

### MCP Connection

- **Port conflict** (`EADDRINUSE`) — Change `TD_WEB_SERVER_PORT` in `.mcp.json`
- **TD absent on startup** — Normal, docs-only mode active. Use `get_health` to check
- **Invalid config** — Verify path: `node ./_mcp_server/dist/cli.js --help`
- **Check connection** — `get_health` (immediate) or `wait_for_td` (waits up to 30s)

### Python Execution

- **Script blocked** — Check the `mode`. Use `preview=true` to analyze
- **Module `td` not found** — Normal outside TD, tests mock via `conftest.py`
- **Network timeout** — TD may be slow. Try `wait_for_td(timeoutSeconds=60)`

### GLSL Validation

- **glslangValidator missing** — Auto-provisioned on Windows x64. Other OS: `brew install glslang` or `apt install glslang-tools`
- **Download failed** — Delete sentinel `.glslang_download_failed` to force retry
