---
name: td-lint
description: "Python DAT linting, code quality, and ruff-based correction loops in TouchDesigner. Use whenever linting DAT operators, auto-fixing Python code, reviewing ruff diagnostics, running correction loops, cleaning up Python, fixing PEP8 warnings, formatting TouchDesigner Python, or improving code style in DATs. Also use when the user mentions ruff, DAT code quality, or Python linting in a TD context — even without saying 'lint' explicitly."
---

# TouchDesigner DAT Linting

> **Cache rule**: If you already loaded this skill or read a reference file in the current conversation, do NOT re-read it. Use your memory of the content.

> **Post-write rule**: After ANY `set_dat_text` on a Python DAT, call `lint_dat` immediately. Fix and re-write if linting fails. Skip validation for data DATs (JSON, CSV, plain text).

## Mental Model

- DAT operators are text containers inside a live TouchDesigner session — they hold Python, GLSL, data, or plain text
- Ruff runs **outside** TD (via MCP subprocess) against a temp copy of the DAT's `.text` content
- The project's `pyproject.toml` ruff config applies automatically — rules, ignores, and per-file overrides are inherited
- The **Correction Loop** is the safe pattern for fixing code in a live TD session: lint → dry-run → confirm → apply → verify runtime
- TD Python is not standard Python — it has injected globals (`op`, `me`, `tdu`, `parent()`) that ruff flags as undefined unless suppressed

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, consider running `index_td_project` first. Use `@td-context` for the full workflow.

2. **Python DATs only.** Ruff parses Python. Running it on GLSL, data, or text DATs produces garbage diagnostics. Always verify `kindGuess == "python"` from `discover_dat_candidates` before linting. WHY: GLSL syntax overlaps with Python keywords enough that ruff won't crash — it will silently produce wrong fixes.

3. **Never skip the diagnostic step.** Always run `lint_dat({ fix: false })` before any fix attempt. WHY: You need the full diagnostic picture to decide which fixes are safe. Jumping to `fix: true` on unfamiliar code risks applying partial fixes that break runtime behavior.

4. **Dry-run before applying on unknown code.** Use `lint_dat({ fix: true, dryRun: true })` to preview the unified diff before committing changes. WHY: Ruff auto-fixes can remove imports that TD injects at runtime, or collapse expressions the user intentionally expanded for readability.

5. **Save original text before fixing.** Call `get_dat_text` and store the result before any `lint_dat({ fix: true })` call. WHY: If the fix introduces TD runtime errors, you need the original to rollback via `set_dat_text`. There is no undo in the MCP API.

6. **Verify runtime after every fix.** Call `get_node_errors` after applying fixes. If errors appear, rollback immediately with `set_dat_text` and report the failure. WHY: Ruff validates syntax, not TD runtime semantics. A syntactically valid fix can break a live operator.

7. **Respect TD's false-positive globals.** `op`, `me`, `parent()`, `ipar`, `tdu`, `ext`, `mod`, `absTime` are injected by TD at runtime. Ruff flags these as F821 (undefined name) or F401 (unused import for `from TDStoreTools import *`). Suppress with `# noqa` or explain — never "fix" by removing them.

8. **One DAT at a time.** Process each DAT through the full correction loop individually. WHY: Batching fixes across DATs makes rollback ambiguous and error attribution impossible.

9. **Use the right tool for the language.** Do not use `lint_dat` (ruff) on GLSL or JSON/YAML DATs — use `validate_glsl_dat` or `validate_json_dat` instead. WHY: Ruff is a Python linter; it will parse non-Python content as broken Python and suggest destructive "fixes".

10. **Ruff version mismatch.** TD may have an older system ruff (e.g., 0.7.0) while the project's `.venv` has a newer version (>=0.8). The MCP server's `_find_ruff()` prioritizes the `.venv` binary over system PATH. If lint fails with "Unknown rule selector", check `get_capabilities()` for the ruff version — it may not support all `pyproject.toml` rules. WHY: Rules like `TC` (type-checking imports) require ruff >=0.8.

11. **Pyright may silently fail.** `typecheck_dat` returns 0 diagnostics when pyright can't run (e.g., `pyright-python` wrapper fails on Windows with "Failed to canonicalize script path"). Check `get_capabilities()` — if `tools.pyright.version` is `null`, typecheck results are unreliable. WHY: The endpoint returns `success: true` with empty diagnostics rather than an error.

## Step 0: Preflight — Check Capabilities

Before starting any lint workflow, call `get_capabilities` to verify the required tools are available:

```
get_capabilities()
```

Check the response:
- If `lint_dat == false` → **abort** and tell the user: "ruff is not available on the TD server. Install it with `uv add ruff`."
- If `format_dat == false` → skip format-related steps (not critical for linting)
- If `typecheck_dat == false` → skip typecheck steps (pyright not available)

**Do not proceed with linting if `lint_dat` is false.** The workflow will fail mid-execution.

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| Ruff rule details (what E711 means, fix behavior) | `mcp__Context7__query-docs` | Resolve `ruff` via `mcp__Context7__resolve-library-id`, then query the rule code |
| Ruff config options (select, ignore, per-file-ignores) | `mcp__Context7__query-docs` | Query `"ruff configuration select ignore"` |
| TD Python API (op(), me, tdu, callbacks) | `mcp__exa__get_code_context_exa` | `"TouchDesigner Python op() me tdu API"` |
| TD-specific linting patterns, community workarounds | `mcp__exa__web_search_exa` | `"TouchDesigner Python linting ruff"` |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: correction loop workflow, guardrails, response schema shapes, TD false-positive patterns
- **Fetch fresh docs** for: specific ruff rule behavior, new ruff features, unfamiliar TD Python APIs

## Loading References

This skill uses progressive loading. Follow this sequence:
1. Find the ONE row in the routing table below that matches your task
2. Load that file only
3. If it is an index, pick the ONE sub-file that matches and load it

If you discover mid-task that you need a second reference, load it then.

## Reference Docs

| Your task | Load |
|---|---|
| Response schemas, ruff rules, TD Python patterns | @references/index.md |
| Full correction loop walkthrough | @examples/index.md |

## MCP Tools

| Tool | Purpose | Call |
|---|---|---|
| `get_capabilities` | Preflight: check available tools | `get_capabilities()` |
| `discover_dat_candidates` | Find DATs under a parent, classified by kind | `discover_dat_candidates({ parentPath: '/project1', purpose: 'python' })` |
| `get_dat_text` | Read DAT source code (and save for rollback) | `get_dat_text({ nodePath: '/project1/script1' })` |
| `lint_dat` (check) | Lint without fixing — get diagnostics | `lint_dat({ nodePath: '/project1/script1' })` |
| `lint_dat` (dry-run) | Preview fix as unified diff | `lint_dat({ nodePath: '/project1/script1', fix: true, dryRun: true })` |
| `lint_dat` (fix) | Apply auto-fixes to DAT text | `lint_dat({ nodePath: '/project1/script1', fix: true })` |
| `set_dat_text` | Write text back to DAT (for rollback) | `set_dat_text({ nodePath: '/project1/script1', text: '...' })` |
| `get_node_errors` | Check TD runtime errors after fix | `get_node_errors({ nodePath: '/project1/script1' })` |
| `format_dat` | Auto-format Python code with ruff | `format_dat({ nodePath: '/project1/script1' })` |
| `format_dat` (dry-run) | Preview formatting diff | `format_dat({ nodePath: '/project1/script1', dryRun: true })` |
| `typecheck_dat` | Type-check Python code with pyright | `typecheck_dat({ nodePath: '/project1/script1' })` |
| `lint_dats` | Batch lint all DATs under a parent | `lint_dats({ parentPath: '/project1', recursive: true })` |
| `validate_json_dat` | Validate JSON/YAML content | `validate_json_dat({ nodePath: '/project1/config1' })` |
| `validate_glsl_dat` | Validate GLSL shader syntax | `validate_glsl_dat({ nodePath: '/project1/shader_pixel' })` |

## 6-Step Lint & Fix Workflow

### 1. Discover
Find Python DATs in the target scope:
```
discover_dat_candidates({ parentPath: '/project1', purpose: 'python', recursive: true })
```

### 2. Read
Inspect the source code before linting:
```
get_dat_text({ nodePath: '/project1/script1' })
```

### 3. Lint (check only)
Run read-only lint to see all diagnostics:
```
lint_dat({ nodePath: '/project1/script1' })
```

### 4. Report
Present diagnostics to the user. Group by severity and fixability.

### 5. Fix (safe)
Use the correction loop (see @examples/correction-loop.md). Never jump straight to `fix: true` without checking first.

### 6. Verify
After applying fixes, confirm no TD runtime errors:
```
get_node_errors({ nodePath: '/project1/script1' })
```

## Response Format

Structure your output as:

1. **Discovery summary** — how many Python DATs found, their paths and line counts
2. **Diagnostic report** — grouped by DAT, showing rule code, message, line, and fixability
3. **Fix plan** — which diagnostics are auto-fixable, which need manual attention, which are TD false positives to suppress
4. **Correction results** — diff preview (dry-run), applied status, remaining diagnostics, runtime verification
5. **Rollback notice** (if needed) — what failed and that the original was restored
