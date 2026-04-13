---
name: td-python
description: "TouchDesigner Python: utility modules (TDFunctions, TDJSON, TDStoreTools, TDResources), DAT linting with ruff, code quality, formatting, and type-checking. Use this skill when serializing TD objects to JSON, round-tripping parameters via JSON, using StorageManager or DependDict/DependList, creating PopMenu or PopDialog, downloading files with op.TDResources, using TDFunctions helpers, linting DAT operators, auto-fixing Python code, reviewing ruff diagnostics, running correction loops, cleaning up Python, fixing PEP8 warnings, or formatting TD Python. Also trigger on imports of TDFunctions, TDJSON, TDStoreTools, references to op.TDResources, StorageManager, DependDict, or mentions of ruff, DAT code quality, Python linting in a TD context."
---

# TD Python & Code Quality

> **Cache rule**: If you already loaded this skill or read a reference file in the current conversation, do NOT re-read it. Use your memory of the content.

> **Post-write rule**: After ANY `set_dat_text` on a Python DAT, call `lint_dat` immediately. Fix and re-write if linting fails. Skip validation for data DATs (JSON, CSV, plain text). For GLSL DATs, use `validate_glsl_dat` instead. For JSON/YAML DATs, use `validate_json_dat`.

> **Execution mode rule**: Default to `read-only` mode for `execute_python_script` when inspecting code. Only escalate to `safe-write` when creating/modifying operators, and `full-exec` when filesystem access is needed.

## Mental Model — Utility Modules

- **TDJSON > json** for TD data — it handles Par, Cell, Channel, OP references that `json.dumps` cannot
- **TDStoreTools** = structured storage tied to COMP lifecycle — StorageManager keeps `me.store` in sync with a schema, DependDict/DependList trigger cook when read
- **TDFunctions** = grab-bag of helpers that prevent reinventing the wheel — paths, layout, params, menus, tScript bridge
- **TDResources** = singleton system COMP (`op.TDResources`) exposing UI popups (PopMenu, PopDialog), HTTP (WebClient), file I/O (FileDownloader), and MouseCHOP
- These modules have **specific failure modes**: silent None returns, class-level mutations, destructive flags enabled by default

## Mental Model — DAT Linting

- DAT operators are text containers inside a live TouchDesigner session — they hold Python, GLSL, data, or plain text
- Ruff runs **outside** TD (via MCP subprocess) against a temp copy of the DAT's `.text` content
- The project's `pyproject.toml` ruff config applies automatically — rules, ignores, and per-file overrides are inherited
- The **Correction Loop** is the safe pattern for fixing code in a live TD session: lint → dry-run → confirm → apply → verify runtime
- TD Python is not standard Python — it has injected globals (`op`, `me`, `tdu`, `parent()`) that ruff flags as undefined unless suppressed

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, run `index_td_project` first (see td-guide skill).

2. **TDJSON over json for TD data.** `json.dumps` cannot serialize Par, Cell, Channel, or OP objects. Use `TDJSON.serializeTDData(data)`. **WHY:** TypeError on TD types with no useful message.

3. **textToJSON/datToJSON return None on failure.** Always null-check the result before using it. **WHY:** Silent None propagates as AttributeError far from the actual parse failure.

4. **destroyOthers=True deletes everything not in the JSON.** `COMP.loadChildrenFromJSONDict` with `destroyOthers=True` removes all child operators not present in the dict.

5. **StorageManager sync=True erases unlisted items.** Any storage key not in `items` is deleted.

6. **StorageManager is keyed by class name, not instance.** Two extensions with the same class name sharing a COMP will collide.

7. **createProperty() adds to the CLASS, not the instance.** `TDFunctions.createProperty(ext, name, ...)` uses `type(ext)` — shared across all instances.

8. **DependDict/DependList are expensive.** Every read marks the reader as dependent. Use plain dict/list unless cook-reactivity is needed.

9. **tScript() creates and destroys a textDAT per call.** Extremely slow in loops; use Python API equivalents.

10. **applyParInfo() is silent by default.** Returns failed parameter names but does not raise. Always check the return value.

11. **Check par.mode before modifying values.** If `par.mode` is `ParMode.BIND` or `ParMode.EXPRESSION`, setting `par.val` overwrites the binding.

12. **`root` n'existe pas — utiliser `op('/')`.** Dans `execute_python_script`, `root` n'est pas defini. **WHY:** `NameError: name 'root' is not defined`.

13. **`td.Page` est unhashable.** Convertir avec `str(p.page)`. **WHY:** `TypeError: unhashable type: 'td.Page'`.

14. **`Exception` peut ne pas etre defini dans les longs scripts MCP.** Utiliser des checks preventifs (`if not geo: continue`).

15. **MCP execution modes et le security analyzer.** `read-only` bloque `.eval()`; utiliser `safe-write` ou `str(par.Mypar)`.

16. **`result` doit etre la variable de sortie.** Les scripts `execute_python_script` assignent leur retour a `result`.

17. **Python DATs only for ruff.** Running ruff on GLSL, data, or text DATs produces garbage. Always verify `kindGuess == "python"` from `discover_dat_candidates`.

18. **Never skip the diagnostic step.** Always run `lint_dat({ fix: false })` before any fix attempt. Jumping to `fix: true` risks partial fixes.

19. **Dry-run before applying on unknown code.** Use `lint_dat({ fix: true, dryRun: true })` to preview the diff.

20. **Save original text before fixing.** Call `get_dat_text` and store result before `lint_dat({ fix: true })`. No undo in MCP API.

21. **Verify runtime after every fix.** Call `get_td_node_errors` after applying fixes. If errors appear, rollback with `set_dat_text`.

22. **Respect TD's false-positive globals.** `op`, `me`, `parent()`, `ipar`, `tdu`, `ext`, `mod`, `absTime` are injected by TD. Ruff flags these as F821/F401 — suppress with `# noqa`, never "fix" by removing.

23. **One DAT at a time.** Process each DAT through the full correction loop individually.

24. **Ruff version mismatch.** The MCP server's `_find_ruff()` prioritizes `.venv` binary. Check `get_capabilities()` for the ruff version.

25. **Pyright may silently fail.** `typecheck_dat` returns 0 diagnostics when pyright can't run. Check `get_capabilities()`.

## Preflight — Check Capabilities

Before any lint workflow, call `get_capabilities` to verify tools:
- `lint_dat == false` → **abort** (ruff not available)
- `format_dat == false` → skip format steps
- `typecheck_dat == false` → skip typecheck steps

## MCP Lint Tools

| Tool | Purpose |
|---|---|
| `get_capabilities` | Preflight: check available tools |
| `discover_dat_candidates` | Find DATs classified by kind |
| `get_dat_text` | Read DAT source (save for rollback) |
| `lint_dat` | Lint (check/dry-run/fix modes) |
| `lint_dats` | Batch lint under a parent |
| `set_dat_text` | Write text back (rollback) |
| `get_td_node_errors` | Check TD runtime errors post-fix |
| `format_dat` | Auto-format with ruff |
| `typecheck_dat` | Type-check with pyright |
| `validate_json_dat` | Validate JSON/YAML content |
| `validate_glsl_dat` | Validate GLSL shader syntax |

## 6-Step Lint & Fix Workflow

1. **Discover** — `discover_dat_candidates({ parentPath, purpose: 'python', recursive: true })`
2. **Read** — `get_dat_text` (inspect + save original for rollback)
3. **Lint** — `lint_dat({ fix: false })` (check only, see all diagnostics)
4. **Report** — present diagnostics grouped by severity and fixability
5. **Fix** — use the correction loop (see @examples/correction-loop.md)
6. **Verify** — `get_td_node_errors` to confirm no TD runtime errors

## Fetching Documentation

| Question domain | Tool to use | How |
|---|---|---|
| TD Python API (`op`, `par`, `COMP` methods) | `mcp__Context7__query-docs` | Resolve `"derivative/touchdesigner"`, then query |
| Official Python examples from Derivative | `search_snippets` | query + optional `family`/`opType` |
| Full snippet with embedded Python code | `get_snippet` | snippet ID |
| Function signatures in TDFunctions/TDJSON | `mcp__Context7__query-docs` | Query with module + function name |
| Parameter names on a specific node | `get_node_parameter_schema` | Pass `nodePath` + optional `pattern` |
| Community patterns for StorageManager | `mcp__exa__web_search_exa` | Semantic search |
| Ruff rule details (what E711 means) | `mcp__Context7__query-docs` | Resolve `ruff`, then query the rule code |
| Ruff config options | `mcp__Context7__query-docs` | Query `"ruff configuration select ignore"` |

**Snippets for Python:** `search_snippets` returns Derivative's official .tox examples containing embedded Python code in DAT operators. Use when you need working Python patterns for a specific operator type, data-flow examples, or CHOP export configurations.

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: guardrails, flag semantics, silent failure patterns, correction loop workflow, response schema shapes, TD false-positive patterns
- **Fetch fresh docs** for: exact function signatures you haven't verified, new TD version changes, specific ruff rule behavior, new ruff features

## Loading References

This skill uses progressive loading. Follow this sequence:
1. Find the ONE row in the routing table below that matches your task
2. Load that file only
3. If it is an index, pick the ONE sub-file that matches and load it

If you discover mid-task that you need a second reference, load it then.

## Reference Docs

| Your task | Load |
|---|---|
| TDFunctions, TDJSON, TDStoreTools, TDResources | @references/index.md |
| Ruff rules, response schemas, TD Python patterns | @references/index.md |
| Full correction loop walkthrough | @examples/correction-loop.md |
| Batch lint, format, typecheck, multi-lang validation | @examples/index.md |

## Response Format

### For utility module usage:
1. State which reference(s) you loaded
2. Show the correct pattern with a code block — always include the null-check or flag guard
3. If the user's approach has a silent failure mode, show the bad pattern first with a comment
4. Reference the specific guardrail number when warning about a pitfall

### For linting:
1. **Discovery summary** — how many Python DATs found, their paths and line counts
2. **Diagnostic report** — grouped by DAT, showing rule code, message, line, fixability
3. **Fix plan** — auto-fixable, manual, TD false positives to suppress
4. **Correction results** — diff preview, applied status, remaining diagnostics, runtime verification
5. **Rollback notice** (if needed) — what failed and that the original was restored
