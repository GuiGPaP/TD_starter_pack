# TD Starter Pack — TouchDesigner x Claude MCP

![CI](https://github.com/GuiGPaP/TD_starter_pack/actions/workflows/ci.yml/badge.svg)

Starter pack for controlling TouchDesigner from Claude via the Model Context Protocol (MCP).
The MCP server runs in **docs-only mode** (operator search, GLSL patterns, assets) without TouchDesigner, and automatically switches to **live mode** when TD is connected.

> Builds on [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) with additional features: GLSL validation, DAT linting/typechecking, project indexing, knowledge base (542 offline docs), network templates, workflow suggestions, tutorials library, TD version history, Claude skills, and more.

**[Full user guide (EN)](docs/user-guide.en.md)** | **[Guide utilisateur (FR)](docs/user-guide.md)**

[Lire en francais](README.fr.md)

## Prerequisites

- **Node.js 18+** — required for the MCP server
- **TouchDesigner 2023+** *(optional)* — required only for live tools
- **Claude Code**, **Claude Desktop**, or any compatible MCP client

## Quick Start

### Docs-only mode (without TouchDesigner)

```bash
# 1. Clone and bootstrap (submodules, deps, git hooks)
git clone https://github.com/GuiGPaP/TD_starter_pack.git
cd TD_starter_pack
just setup                                  # requires `mise install` if you don't have just/uv

# 2. Build the MCP server
cd _mcp_server && npm run build:dist && cd ..
```

3. Relaunch Claude Code in this folder — the MCP config is included (`.mcp.json`), search tools are immediately available (operators, GLSL patterns, assets).

> **No `just` available?** Run the steps manually: `git submodule update --init --recursive && cd _mcp_server && npm ci && npm run build:dist`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer setup including git hooks.

### Live mode (with TouchDesigner)

1. Complete the docs-only Quick Start above
2. Open `starter_pack.toe` in TouchDesigner — the `mcp_webserver_base.tox` component starts the web bridge on port 9981
3. Use `get_health` to verify the connection, or `wait_for_td` to wait until TD is ready

## Submodules

Two components live in their own public repos and are included here as git submodules (extracted 2026-04-14 for standalone OSS distribution):

- **[TDpretext](https://github.com/GuiGPaP/TDpretext)** (`TDpretext/`) — Pretext-based text layout in TouchDesigner via Web Render TOP.
- **[TDDocker](https://github.com/GuiGPaP/TDDocker)** (`TDDocker/`) — Docker lifecycle manager for TD (compose overlay, transports, watchdog). Contains a nested submodule `TD_SLlidar_docker/sllidar_ros2/` pinned to the Slamtec upstream.

After cloning, always run:

```bash
git submodule update --init --recursive
```

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
| **Search** | `search_operators`, `search_td_assets`, `search_glsl_patterns`, `search_projects`, `search_tutorials`, `search_techniques`, `search_workflow_patterns`, `search_network_templates`, `search_snippets`, `search_palette`, `search_lessons`, `describe_td_tools` | offline |
| **Comparison** | `compare_operators` | offline |
| **Catalogs** | `get_td_asset`, `get_glsl_pattern`, `get_tutorial`, `get_technique`, `get_workflow_pattern`, `get_network_template`, `get_snippet`, `get_lesson`, `get_capabilities` | offline |
| **Workflow** | `suggest_workflow` | offline |
| **Versions** | `list_versions`, `get_version_info`, `list_experimental_builds`, `get_experimental_build` | offline |
| **Project catalog** | `scan_projects`, `search_projects` | offline |
| **Nodes** | `get_td_nodes`, `get_td_node_parameters`, `create_td_node`, `delete_td_node`, `update_td_node_parameters`, `get_td_node_errors`, `scan_network_errors` | live |
| **Layout / Wiring** | `layout_nodes`, `connect_nodes`, `copy_node`, `screenshot_operator`, `export_subgraph` | live |
| **Helpers** | `create_geometry_comp`, `create_feedback_loop`, `configure_instancing` | live |
| **Execution** | `execute_python_script` (modes: read-only/safe-write/full-exec), `exec_node_method` | live |
| **Audit** | `get_exec_log` | offline |
| **Packaging** | `package_project`, `bulk_package_projects` | live |
| **TD introspection** | `get_td_info`, `get_td_classes`, `get_td_class_details`, `get_td_module_help` | live |
| **Node introspection** | `get_node_parameter_schema`, `complete_op_paths`, `get_chop_channels`, `get_dat_table_info`, `get_comp_extensions` | live |
| **DAT** | `get_dat_text`, `set_dat_text`, `lint_dat`, `lint_dats`, `typecheck_dat`, `format_dat`, `discover_dat_candidates` | live |
| **Validation** | `validate_glsl_dat`, `validate_json_dat` | live |
| **Deploy** | `deploy_td_asset`, `deploy_glsl_pattern`, `deploy_network_template`, `undo_last_deploy` | live |
| **Palette** | `index_palette`, `load_palette_component` | live |
| **Project context** | `index_td_project`, `get_td_context` | live |
| **Performance** | `get_performance` (FPS + trail stats via `_perf_monitor` / `_perf_trail`) | live |
| **Lessons** | `capture_lesson`, `scan_for_lessons` | live |

**offline** = works without TouchDesigner | **live** = requires an active TD connection

> Call `describe_td_tools` at runtime for the canonical, always-up-to-date list.

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
_mcp_server/             # MCP server (Node.js, inlined 2026-03-26) — originally forked from 8beeeaaat/touchdesigner-mcp
TDpretext/               # submodule: Pretext-based text layout in TD (Web Render TOP)
TDDocker/                # submodule: Docker lifecycle manager for TD (+ nested SLlidar submodule)
modules/
  mcp/services/          # business logic (hand-maintained)
  mcp/controllers/       # OpenAPI routing + generated handlers
  td_helpers/            # network & layout helpers
  td_server/             # OpenAPI server (originally generated)
  utils/                 # result types, logging, serialization
  tests/                 # pytest unit + smoke tests (fake_td.py = fake TD graph)
.claude/skills/          # Claude skills (td-guide, td-glsl, td-python, td-pretext, td-sketch-ui)
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
| TD network / operators / layout / rendering / project context | `td-guide` |
| GLSL shaders (pixel, vertex, compute, particles) | `td-glsl` |
| Python utilities (TDFunctions, TDJSON, TDStoreTools, TDResources), DAT linting, ruff | `td-python` |
| Native text layout / font atlas / obstacle avoidance | `td-pretext` |
| UI from sketch / wireframe → Palette widgets | `td-sketch-ui` |

When in doubt, start with `td-guide` — it routes to `td-glsl` for shaders and `td-python` for Python work.

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

## Versioning

This monorepo contains two independently versioned components:

- **`pyproject.toml` (v0.1.0)** — Python wrapper for the monorepo (tests, CI, modules). Follows its own SemVer, starting from MVP.
- **`_mcp_server/package.json` (v1.5.0-td.1)** — TouchDesigner MCP server, forked from [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) v1.5.0. The `-td.1` suffix marks our divergence for TD_starter_pack.

These cycles stay separate by design: the MCP server may be published standalone on npm, while the root wrapper tracks the starter-pack release cadence.

## Attribution

Based on and adapted from open-source repos (MIT):
- [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) — original TouchDesigner MCP server (code base for `_mcp_server/`)
- [bottobot/touchdesigner-mcp-server](https://github.com/bottobot/touchdesigner-mcp-server) — inspiration for the offline documentation features: workflow suggestion engine, tutorials, network templates, experimental builds, techniques library, and TD version history
- [satoruhiga/claude-touchdesigner](https://github.com/satoruhiga/claude-touchdesigner) — td-guide skill
- [rheadsh/audiovisual-production-skills](https://github.com/rheadsh/audiovisual-production-skills) — GLSL / POP skill material (merged into `td-glsl`)

## License

[MIT](LICENSE)
