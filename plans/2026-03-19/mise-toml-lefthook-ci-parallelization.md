<!-- session_id: 7b18efe8-8678-4072-b0ab-67360dad2c54 -->
# Plan: mise.toml + Lefthook + CI Parallelization

## Context

The repo's code quality tooling (uv + ruff + pyright + pytest) is solid, but three gaps remain:
1. **No tool version pinning** — contributors must manually install the right versions of uv, just, lefthook
2. **No local enforcement** — linting/formatting only runs in CI or manually via `just`
3. **CI is sequential** — lint, typecheck, and test run in a single job

The tooling layering is: **mise** (install/pin binaries) → **just + uv** (orchestrate) → **ruff, pyright, pytest** (execute).

uv workspaces are **deferred** — the project is ~80 files with a simple dependency graph and a TouchDesigner runtime that manages `sys.path` itself.

## Changes

### 1. mise.toml — tool version pinning

**Create `mise.toml`** at project root:
```toml
[tools]
uv = "latest"
just = "latest"
lefthook = "latest"
```

- `uv` is currently system-installed (`/usr/bin/uv 0.10.8`). Pinning via mise ensures contributors get a consistent version.
- `just` is already managed globally by mise (`1.44.0`). Project-level pin overrides the global.
- `lefthook` was installed via mise but had no pin — this fixes that.
- Using `"latest"` for all three: these are dev tools where staying current is preferred over pinning exact versions.

After creating, run `mise install` to ensure all tools are available.

### 2. Lefthook setup

`lefthook.yml` and the `just hooks` recipe **already exist** from the previous implementation round. The only fix needed:

- The glob in `lefthook.yml` was already corrected to `"modules/**/*.py"` — this is the current state on disk.
- Run `lefthook install` to wire up `.git/hooks/`.

### 3. CI parallelization

`.github/workflows/ci.yml` was **already rewritten** with 3 parallel jobs (lint, typecheck, test). No further changes needed — the current state on disk is correct.

### 4. Justfile

The `hooks` recipe **already exists**. No changes needed.

## Files to create/modify

| File | Action |
|------|--------|
| `mise.toml` | **Create** — pin uv, just, lefthook |

Already done (from previous round, on disk):
| File | State |
|------|-------|
| `lefthook.yml` | Already created, glob scoped to `modules/**/*.py` |
| `.github/workflows/ci.yml` | Already rewritten with 3 parallel jobs |
| `justfile` | Already has `hooks` recipe |

## Verification

1. `mise install` succeeds and all 3 tools resolve
2. `lefthook install` succeeds
3. `lefthook run pre-commit` shows correct skip/pass behavior
4. `just check` still works
5. `git status` shows only `mise.toml` as the new untracked file
