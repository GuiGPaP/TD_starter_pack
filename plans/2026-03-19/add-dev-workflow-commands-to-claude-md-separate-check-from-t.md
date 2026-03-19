<!-- session_id: ce39952c-2ea8-4c1d-a9bb-ca7180c0d2a2 -->
# Plan: Add Dev Workflow Commands to CLAUDE.md + Separate check from test

## Context
The user wants a quick-reference section of dev workflow commands in the project CLAUDE.md, and wants `just check` to not include tests (lint + typecheck only).

## Changes

### 1. `justfile` — remove `test` from `check` deps

```diff
-check: lint typecheck test
+check: lint typecheck
```

### 2. `CLAUDE.md` — add Dev Workflow section (after "Global Rule", before "Workflow Orchestration")

```markdown
## Dev Workflow

- `just` — list all available commands
- `just check` — run all checks (lint, typecheck)
- `just test` — run test suite
```

## Files
- `justfile` (line 25)
- `CLAUDE.md`

## Verification
- `just check` runs without invoking pytest
- Read CLAUDE.md to confirm formatting
