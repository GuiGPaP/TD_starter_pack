# Contributing to TD Starter Pack

Thanks for your interest in contributing! This project pairs a TypeScript MCP server with a Python/TouchDesigner toolkit, so setup involves both stacks.

## Prerequisites

- **TouchDesigner 2023.12000+** (optional — only needed for live MCP tools)
- **Python 3.11+** (managed via [mise](https://mise.jdx.dev/))
- **Node.js 20+**
- **[uv](https://github.com/astral-sh/uv)**, **[just](https://github.com/casey/just)**, **[lefthook](https://github.com/evilmartians/lefthook)** — installed automatically by `mise install` (see `mise.toml`)

## Development setup

```bash
git clone https://github.com/GuiGPaP/TD_starter_pack.git
cd TD_starter_pack
git submodule update --init --recursive    # TDpretext + TDDocker

mise install                                # tool versions
uv sync                                     # Python deps
cd _mcp_server && npm install && cd ..      # MCP server deps
```

## Workflow

1. **Plan first** — for any non-trivial change (3+ steps or architectural decisions), start with a written plan. See `CLAUDE.md` if you use Claude Code.
2. **Branch via worktree** — `git-wt <name> [branch]` keeps multiple changes isolated; see `CLAUDE.md`.
3. **Verify locally** before pushing:
   - `just check` — ruff lint + pyright typecheck (Python)
   - `just test` — pytest suite
   - `cd _mcp_server && npm run lint && npm test` — TS lint + tests
4. **Open a PR** against `main`. CI runs the same checks (see `.github/workflows/ci.yml`).

## Code style

- **Python**: `ruff` (lint + format) + `pyright` (type-check). Config in `pyproject.toml`. Target `py311`.
- **TypeScript**: ESLint + strict TS. Config in `_mcp_server/`.
- Generated code (`modules/td_server/openapi_server/`, `modules/mcp/controllers/generated_handlers.py`) is excluded from linting — don't hand-edit.

## Submodules

`TDpretext/` and `TDDocker/` are independent public repos. When working across modules:
- Submodule changes must be committed and pushed **in the submodule first**, then the parent repo's pointer bumped.
- See `CLAUDE.md#Submodules` for the full workflow (and the `submodule-setup` skill if you use Claude Code).

## Commits

- One logical change per commit; descriptive messages.
- Pre-commit hooks (via `lefthook.yml`) run ruff + basic checks — let them run; don't use `--no-verify`.

## Reporting bugs / requesting features

Open an issue at https://github.com/GuiGPaP/TD_starter_pack/issues with:
- TouchDesigner version and OS
- MCP server mode (offline / live) and relevant env vars
- Minimal reproduction steps

## Security issues

See [`SECURITY.md`](SECURITY.md) — do not open public issues for vulnerabilities.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
