# TD_starter_pack - Codex Project Instructions

## Skill Decision Tree

When working with TouchDesigner, use the repo skills in `.agents/skills`:

| Need | Skill |
|------|-------|
| TD networks, operators, layout, rendering, project context | `td-guide` |
| GLSL shaders: pixel, vertex, compute, particles | `td-glsl` |
| TD Python utilities, DAT linting, ruff, type checking | `td-python` |
| Native text layout, font atlas, obstacle avoidance, glyph instancing | `td-pretext` |
| Sketch or mockup image to Palette widget UI | `td-sketch-ui` |
| Web/JS `@chenglou/pretext` usage outside native TD | `pretext` |

When in doubt, start with `td-guide`; it routes shader work to `td-glsl` and Python/DAT quality work to `td-python`.

## Session Start

- If `tasks/errors-log.md` exists, read the unresolved errors and lesson candidates before starting new work.
- Treat pretrained TouchDesigner details as unreliable. Verify operator types, parameter names, menu values, and API signatures through the relevant skill references and live MCP introspection before writing TD code.
- Do not modify existing user changes unless the task requires working with them.

## Development Workflow

- `just` lists available commands.
- `just check` runs lint, type check, and module sync checks.
- `just test` runs the Python test suite.
- For `_mcp_server/`, use `npm run lint`, `npm run test:unit`, or `npm test` from `_mcp_server/`.
- For `TDDocker/`, run checks from that directory with its own `pyproject.toml`.

## TouchDesigner Guardrails

- Before writing TD network code, check for `td_project_context.md`; if missing, build project context with the MCP project indexing tools.
- Prefer high-level MCP tools and repo helpers over raw `execute_python_script` when available.
- Use read-only inspection first; only switch to write execution when creating or changing operators.
- After creating or modifying TD networks, verify errors with `get_td_node_errors`, `scan_network_errors`, or the relevant MCP error scan.
- For GLSL DAT edits, validate with `validate_glsl_dat`.
- For Python DAT edits, lint with `lint_dat` and verify runtime errors after changes.

## Generated and External Areas

- `modules/td_server/openapi_server/` and `modules/mcp/controllers/generated_handlers.py` are generated; change templates or generators instead of hand-editing generated output.
- `TDpretext/` and `TDDocker/` may be submodules or separately versioned components. Check their status before editing.
- Avoid committing local session state such as `tasks/errors-log.md`.
