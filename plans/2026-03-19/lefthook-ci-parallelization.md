<!-- session_id: 7b18efe8-8678-4072-b0ab-67360dad2c54 -->
# Plan: Lefthook + CI Parallelization

## Context

The repo's code quality tooling (uv + ruff + pyright + pytest) is solid, but two gaps remain:
1. **No local enforcement** — linting/formatting only runs in CI or manually via `just`
2. **CI is sequential** — lint, typecheck, and test run in a single job

The user also asked about uv workspaces. After analysis, this is **deferred** — the project is ~80 Python files with a simple dependency graph and a TouchDesigner runtime that manages `sys.path` itself. Workspaces would add structural overhead with no runtime benefit at this scale.

## Changes

### 1. Lefthook setup

**Install lefthook** via mise (shim exists, tool not yet installed):
```bash
mise install lefthook
```

**Create `lefthook.yml`** at project root:
```yaml
pre-commit:
  parallel: true
  commands:
    lint-fix:
      glob: "*.py"
      run: uv run ruff check --fix {staged_files} && git add {staged_files}
    format:
      glob: "*.py"
      run: uv run ruff format {staged_files} && git add {staged_files}

pre-push:
  parallel: true
  commands:
    typecheck:
      run: uv run pyright
    test:
      run: uv run pytest
```

Design rationale:
- Pre-commit: only staged `.py` files (fast), auto-fix + re-stage
- Pre-push: full pyright + pytest (slower checks, run before sharing)
- Both stages run their commands in parallel

**Add `hooks` recipe to `justfile`:**
```
# Install git hooks (requires lefthook)
hooks:
    lefthook install
```

**Run `lefthook install`** to wire up `.git/hooks/`.

### 2. CI parallelization

**Rewrite `.github/workflows/ci.yml`** — split into 3 parallel jobs:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --group dev
      - run: uv run ruff check modules/
      - run: uv run ruff format --check modules/

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --group dev
      - run: uv run pyright

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync
      - run: uv run pytest --cov --cov-report=term-missing
```

Design rationale:
- Lint + typecheck use `uv sync --group dev` (only ruff/pyright — skips td-server Flask deps)
- Test uses `uv sync` (needs all deps including td-server for integration tests)
- `setup-uv@v4` handles caching by default
- Ruff check + format stay in one job (both sub-second, splitting adds more GHA overhead than it saves)

## Files to create/modify

| File | Action |
|------|--------|
| `lefthook.yml` | **Create** |
| `.github/workflows/ci.yml` | **Rewrite** |
| `justfile` | **Add** `hooks` recipe |

## Verification

1. `lefthook install` succeeds
2. Stage a `.py` file with a lint issue → commit → verify ruff auto-fixes and re-stages
3. `git push --dry-run` triggers pyright + pytest
4. Push to a branch → verify 3 parallel CI jobs appear in GitHub Actions
5. `just check` still works unchanged
