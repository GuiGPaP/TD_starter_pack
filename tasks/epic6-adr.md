# ADR: Unified Source of Truth for Python Modules

**Status:** Accepted
**Date:** 2026-03-20

## Context

The repository has two copies of the MCP Python modules:
- **`modules/`** (root) — actively developed, tested, linted, type-checked by CI
- **`_mcp_server/td/modules/`** (submodule) — upstream original, incomplete port

Root has ~1700 lines of additional functional code (completion engine, GLSL validation, lint_dat, glslang provisioning, modern type annotations). Every shared file has diverged in at least style (tabs vs spaces, `Optional[str]` vs `str | None`).

## Decision

**Root `modules/` is the source of truth for ALL manual Python code.**

The submodule receives a controlled copy via `scripts/sync_modules.py`.

### Manual code flow

```
modules/ (root, source of truth)
  → scripts/sync_modules.py --sync
    → _mcp_server/td/modules/ (submodule, controlled copy)
```

### Generated code flow

```
_mcp_server/src/api/index.yml (OpenAPI spec)
  → npm run gen:handlers (in submodule)
    → _mcp_server/td/modules/mcp/controllers/generated_handlers.py (gitignored, transient)
      → copy to modules/mcp/controllers/generated_handlers.py (root, persisted)
```

### Exceptions

| File | Source of truth | Reason |
|------|----------------|--------|
| `utils/version.py` | submodule (`package.json`) | Version is driven by npm package version, propagated by `syncApiServerVersions.ts` |
| `generated_handlers.py` | generated from OpenAPI spec | Gitignored in submodule; root copy is sole persisted version |
| `td_server/openapi_server/*` | generated (openapi-generator) | Excluded from sync. Both copies are generated artifacts |
| `tests/*` | root only | Tests run in root CI only, not part of submodule |
| `td_helpers/*` | root only | TD-specific helpers, not part of MCP server modules |
| `td.pyi` | root only | Type stubs for testing |

### Style decision

Root style (spaces, modern Python syntax) is adopted everywhere. The submodule's ruff config (`pyproject.toml`) is updated to use `indent-style = "space"` to match root.

## CI enforcement

- **`sync-check` job**: runs `python scripts/sync_modules.py --check` — fails if any manual file differs between root and submodule
- **`generated-check` job**: regenerates `generated_handlers.py` and diffs against root — fails if spec changed without regeneration

## Consequences

- **Positive**: Single place to edit Python code; drift is caught by CI; submodule always has complete feature set
- **Negative**: Developers must run `just sync` after editing Python files; submodule commits require the synced files
- **Risk**: Runtime validation in TD still requires a live TD instance (out of scope for CI)

## Runtime validation notes

The ported code introduces stdlib imports (`subprocess`, `tempfile`, `shutil`, `pathlib`, `difflib`, `fnmatch`, `datetime`) that are available in CPython 3.11+ (TD's Python). The `completion/` module uses only `json` and `re`. Full runtime validation requires a TD live session (out of scope for CI).
