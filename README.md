# TD Starter Pack — TouchDesigner x Claude MCP

![CI](https://github.com/GuiGPaP/TD_starter_pack/actions/workflows/ci.yml/badge.svg)

Starter pack for controlling TouchDesigner from Claude via the Model Context Protocol (MCP).
The MCP server runs in **docs-only mode** (operator search, GLSL patterns, assets) without TouchDesigner, and automatically switches to **live mode** when TD is connected.

> Fork of [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) with additional features: GLSL validation, DAT linting/typechecking, project indexing, knowledge base (542 offline docs), network templates, Claude skills, and more.

**[Full user guide (EN)](docs/user-guide.en.md)** | **[Guide utilisateur (FR)](docs/user-guide.md)**

[Lire en francais](README.fr.md)

## Prerequisites

- **Node.js 18+** — required for the MCP server
- **TouchDesigner 2023+** *(optional)* — required only for live tools
- **Claude Code**, **Claude Desktop**, or any compatible MCP client

## Quick Start

### Docs-only mode (without TouchDesigner)

```bash
# 1. Clone the repo
git clone https://github.com/GuiGPaP/TD_starter_pack.git
cd TD_starter_pack

# 2. Build the MCP server
cd _mcp_server
npm ci
npm run build:dist
cd ..
```

3. Relaunch Claude Code in this folder — the MCP config is included (`.mcp.json`), search tools are immediately available (operators, GLSL patterns, assets).

### Live mode (with TouchDesigner)

1. Complete the docs-only Quick Start above
2. Open `starter_pack.toe` in TouchDesigner — the `mcp_webserver_base.tox` component starts the web bridge on port 9981
3. Use `get_health` to verify the connection, or `wait_for_td` to wait until TD is ready

## Multi-client configuration

### Claude Code (project-local config)

The `.mcp.example.json` file is ready for Claude Code (relative path):

```bash
cp .mcp.example.json .mcp.json
```

### Claude Desktop (`claude_desktop_config.json`)

Use an **absolute path** to `dist/cli.js`:

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

### Codex CLI

```bash
codex mcp add touchdesigner -- node /path/to/TD_starter_pack/_mcp_server/dist/cli.js
```

## Available MCP tools

| Category | Tools | Mode |
|----------|-------|------|
| **Health** | `get_health`, `wait_for_td` | offline |
| **Search** | `search_operators`, `search_td_assets`, `search_glsl_patterns`, `search_projects`, `describe_td_tools` | offline |
| **Comparison** | `compare_operators` | offline |
| **Catalogs** | `get_td_asset`, `get_glsl_pattern`, `get_capabilities` | offline |
| **Project catalog** | `scan_projects`, `search_projects` | offline |
| **Nodes** | `get_td_nodes`, `get_td_node_parameters`, `create_td_node`, `delete_td_node`, `update_td_node_parameters`, `get_td_node_errors` | live |
| **Helpers** | `create_geometry_comp`, `create_feedback_loop`, `configure_instancing` | live |
| **Execution** | `execute_python_script` (modes: read-only/safe-write/full-exec), `exec_node_method` | live |
| **Audit** | `get_exec_log` | offline |
| **Packaging** | `package_project` | live |
| **TD introspection** | `get_td_info`, `get_td_classes`, `get_td_class_details`, `get_td_module_help` | live |
| **Node introspection** | `get_node_parameter_schema`, `complete_op_paths`, `get_chop_channels`, `get_dat_table_info`, `get_comp_extensions` | live |
| **DAT** | `get_dat_text`, `set_dat_text`, `lint_dat`, `lint_dats`, `typecheck_dat`, `format_dat`, `discover_dat_candidates` | live |
| **Validation** | `validate_glsl_dat`, `validate_json_dat` | live |
| **Deploy** | `deploy_td_asset`, `deploy_glsl_pattern` | live |
| **Project context** | `index_td_project`, `get_td_context` | live |

**offline** = works without TouchDesigner | **live** = requires an active TD connection

## Golden Path — basic workflows

### Create a Geometry COMP

```python
create_geometry_comp(parentPath="/project1/base1", name="geo1", x=0, y=0)
```

### Create a feedback loop

```python
create_feedback_loop(parentPath="/project1/base1", name="sim", processType="glslTOP")
```

### Configure instancing

```python
configure_instancing(geoPath="/project1/base1/geo1", instanceOpName="noise_chop")
```

## Project structure

```
_mcp_server/             # MCP server (Node.js) — fork of 8beeeaaat/touchdesigner-mcp
modules/
  mcp/services/          # business logic (hand-maintained)
  mcp/controllers/       # OpenAPI routing + generated handlers
  td_helpers/            # network & layout helpers
  td_server/             # OpenAPI server (originally generated)
  utils/                 # result types, logging, serialization
  tests/                 # pytest unit + smoke tests (fake_td.py = fake TD graph)
.claude/skills/          # Claude skills (td-guide, td-glsl, td-glsl-vertex, td-pops, td-lint)
.mcp.example.json        # MCP config example (copy to .mcp.json)
starter_pack.toe         # starter TouchDesigner project
mcp_webserver_base.tox   # MCP web server component
import_modules.py        # module bootstrap on TD startup
```

## Generated vs maintained code

- **Generated**: `modules/td_server/openapi_server/` (OpenAPI Generator) + `modules/mcp/controllers/generated_handlers.py`
- **Maintained**: everything else under `modules/`

These generated files have received coordinated manual adjustments. The OpenAPI spec remains the source of truth, but manual updates are still needed until the regeneration workflow is formalized. Excluded from linting/type-checking via `pyproject.toml`.

## Extension conventions

To add a feature:

1. **Helper** — add a function in `modules/td_helpers/` (duck-typed, no direct TD dependency)
2. **Service** — expose via a method in `modules/mcp/services/api_service.py`
3. **OpenAPI** — update the `openapi.yaml` spec, then sync derived layers (`generated_handlers.py`, `default_controller.py`)
4. **Tests** — unit test the helper + smoke test the end-to-end workflow

> When to update skills: whenever the MCP tool surface changes (new tool, modified parameters).

## Development

### Python (TouchDesigner modules)

```bash
uv sync                              # install dependencies
uv run pytest                        # run tests
uv run ruff check modules/           # lint
uv run ruff format modules/          # format
uv run pyright                       # type-check
just check                           # all at once (requires just)
```

### MCP Server (Node.js)

```bash
cd _mcp_server
npm ci                               # install dependencies
npm run build:dist                   # compile TypeScript
npm test                             # run tests
npm run lint                         # lint + typecheck
```

## Claude Skills

| Need | Skill |
|------|-------|
| TD network / operators / layout | `td-guide` |
| Pixel shader / GLSL TOP | `td-glsl` |
| Vertex shader / GLSL MAT | `td-glsl-vertex` |
| Compute shader / particles | `td-pops` |
| Python DAT linting / ruff | `td-lint` |

## Troubleshooting

### MCP / Connection

- **Port conflict** (`EADDRINUSE`) — change `TD_WEB_SERVER_PORT` in `.mcp.json` or close other TouchDesigner instances
- **TD not running at startup** — normal, the server starts in docs-only mode. Offline tools work. Use `get_health` to check the connection
- **Invalid config** — verify the path to `dist/cli.js` exists: `node ./_mcp_server/dist/cli.js --help`
- **Check TD connection** — call `get_health` (immediate result) or `wait_for_td` (waits up to 30s)

### Python / TouchDesigner

- **Module `td` not found** — normal outside TouchDesigner, tests mock via `conftest.py`
- **Flask integration tests not collected** — deselected by default via `addopts` + markers in `pyproject.toml`
- **`import_modules.py` can't find schema** — check path `modules/td_server/openapi_server/openapi/openapi.yaml`

## Attribution

Based on and adapted from open-source repos (MIT):
- [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) — original TouchDesigner MCP server
- [satoruhiga/claude-touchdesigner](https://github.com/satoruhiga/claude-touchdesigner) — td-guide skill
- [rheadsh/audiovisual-production-skills](https://github.com/rheadsh/audiovisual-production-skills) — td-glsl, td-glsl-vertex, td-pops skills

## License

[MIT](LICENSE)
