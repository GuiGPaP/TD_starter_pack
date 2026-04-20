---
name: td-python
description: "TouchDesigner Python: utility modules (TDFunctions, TDJSON, TDStoreTools, TDResources), DAT linting with ruff, code quality, formatting, and type-checking. Use this skill when serializing TD objects to JSON, round-tripping parameters via JSON, using StorageManager or DependDict/DependList, creating PopMenu or PopDialog, downloading files with op.TDResources, using TDFunctions helpers, linting DAT operators, auto-fixing Python code, reviewing ruff diagnostics, running correction loops, cleaning up Python, fixing PEP8 warnings, or formatting TD Python. Also trigger on imports of TDFunctions, TDJSON, TDStoreTools, references to op.TDResources, StorageManager, DependDict, or mentions of ruff, DAT code quality, Python linting in a TD context. Also covers Python environment management via tdPyEnvManager: creating venvs or conda envs, writing requirements.txt with PEP 508 platform markers (sys_platform), pip install inside TD, TDPyEnvManagerContext.yaml as project lockfile, Autosetuponstartup pattern. Trigger on: tdPyEnvManager, TDPyEnvManagerContext, venv in TD, conda env in TD, requirements.txt, pip install in TouchDesigner, TD project-local Python deps, winsdk / dasbus / pyobjc in TD."
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

26. **`tdu.Dependency.val` not direct assignment.** `op('comp').Scale = 5` overwrites the Dependency object with a plain int, destroying reactivity. Use `op('comp').Scale.val = 5` to set the value and notify dependents. See `@tdstoretools.md` tdu.Dependency section.

27. **Mutable Dependency contents require `.modified()`.** Appending to a list or modifying a dict key inside a `tdu.Dependency` does not notify dependents. Call `dep.modified()` after in-place mutations, or reassign `.val` entirely to trigger notification.

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

## Python Environment Management (tdPyEnvManager)

> **When to load this section**: user mentions venv, conda env, requirements.txt, pip install, tdPyEnvManager, TDPyEnvManagerContext, installing a Python package in TD, project-local Python deps, or cross-platform markers.

### Mental Model

- `tdPyEnvManager` is a third-party COMP (v1.4.1, `yusuke-nakamura-1992/tdPyEnvManager`) that activates a project-local `.venv/` or conda env by **prepending** its `site-packages` to TD's `sys.path` — it does **not** swap the Python interpreter.
- The interpreter stays TD's bundled Python (e.g. `C:/Program Files/Derivative/TouchDesigner/bin/python.exe`). Consequence: the venv's Python version must match TD's (3.11 for TD 2025.x), otherwise C-extension wheels fail to load.
- `TDPyEnvManagerContext.yaml` is the **lockfile** — it records `mode`, `envName`, `installPath`, `pythonVersion`, `autoSetup` → **commit it**. `.venv/` is the env itself → **gitignore**.
- All heavy operations (`Createvenv`, `Createfromrequirementstxt`, `Exportrequirementstxt`, `Createcondaenv`, …) run on a background thread and mutate `par.Status` when done. **Pulses return immediately** — poll `Status` for completion before chaining the next pulse.

### Setup Workflow (first time)

1. Import the `tdPyEnvManager` COMP (Palette or .tox).
2. Set `Mode=Python vEnv` (default) or `Conda Env`.
3. Set `Installpath=.` (relative to project folder) and `Environmentname=.venv`.
4. Pulse `Createvenv`. Wait until `par.Status == "Environment linked and ready."`.
5. Write `requirements.txt` next to the .toe.
6. Pulse `Createfromrequirementstxt`. Wait again for `Status` to return to ready.
7. Enable `Autosetuponstartup = True` **only after** a successful setup.
8. Save the .toe.

### Cross-Platform `requirements.txt` (PEP 508 markers)

```
# Windows only
winsdk>=1.0.0b10; sys_platform == 'win32'

# Linux only
dasbus>=1.7;     sys_platform == 'linux'
PyGObject>=3.46; sys_platform == 'linux'

# macOS only
pyobjc-core>=10.0;            sys_platform == 'darwin'
pyobjc-framework-Cocoa>=10.0; sys_platform == 'darwin'

# Shared (all OSes)
requests>=2.31.0
```

pip skips lines whose marker does not match the running platform — **one file covers all three OSes**.

### Guardrails (environment-specific)

**E1. tdPyEnvManager does not swap the Python interpreter.** It only modifies `sys.path`. Python version mismatch between the venv and TD's bundled Python breaks C-extension wheel loading. Before creating a venv on a fresh machine, check `sys.version_info` vs TD's bundled version.

**E2. Pulses are async.** `comp.par.Createvenv.pulse()` returns immediately, the work runs on a thread. **Poll `par.Status.val`** until it reads `"Environment linked and ready."` before pulsing `Createfromrequirementstxt`. Chaining pulses back-to-back from one MCP call fires two threads simultaneously.

**E3. `Autosetuponstartup=True` only after a successful first setup.** Setting it before `Createvenv` fires makes the COMP attempt reactivation of a non-existent env at every .toe open → red error on the COMP.

**E4. `TDPyEnvManagerContext.yaml` is the lockfile — commit it.** Its absence forces future sessions to re-infer `mode`, `pythonVersion`, `envName`. `.venv/`, `.cache/`, `__pycache__/` go in `.gitignore`.

**E5. Activation is per-process.** The venv's `site-packages` is injected into `sys.path` at startup (if `Autosetuponstartup=True`) or on pulse. Re-importing an already-imported module does not pick up changes — you need a TD restart or `reload_mod()` if hot-swapping deps.

**E6. Conda mode needs Anaconda or Miniconda on PATH.** If neither is detected, `Createcondaenv` prompts to download a bundled Miniconda (~100 MB). `Keepcondainstaller=True` preserves the installer after setup for offline re-use.

### Key Parameters Reference

| Par | Style | Purpose |
|---|---|---|
| `Active` | Toggle | Master on/off for env linking. |
| `Mode` | Menu | `Python vEnv` / `Conda Env`. |
| `Installpath` | Folder | Where `.venv` / conda env lives (default `.`). |
| `Environmentname` | StrMenu | Env dir name (default `.venv`). |
| `Createvenv` | Pulse | Create a fresh venv. |
| `Createfromrequirementstxt` | Pulse | `pip install -r requirements.txt`. |
| `Exportrequirementstxt` | Pulse | `pip freeze > requirements.txt` (snapshot). |
| `Createcondaenv` | Pulse | Create a conda env. |
| `Createfromenvironmentyml` | Pulse | `conda env create -f environment.yml`. |
| `Exportenvironmentyml` | Pulse | `conda env export > environment.yml`. |
| `Includeglobal` | Toggle | Conda: include global envs in the selector. |
| `Autosetuponstartup` | Toggle | Re-activate env at every .toe open. |
| `Refresh` | Pulse | Re-scan environments. |
| `Reset` | Pulse | Unlink current env (does not delete files on disk). |
| `Restart` | Pulse | Re-run activation logic. |
| `Opencli` | Pulse | Open a shell with the venv activated. |
| `Status` | Str | Read-only status string. |

### MCP Snippets (ready to paste)

```python
# 1. Create the venv
op('/YourComp/tdPyEnvManager').par.Createvenv.pulse()

# 2. Wait (poll) until Status reads "Environment linked and ready."
#    — do this in a SEPARATE execute_python_script call, pulses are async.

# 3. Install from requirements.txt
op('/YourComp/tdPyEnvManager').par.Createfromrequirementstxt.pulse()

# 4. Enable auto-setup on subsequent launches
op('/YourComp/tdPyEnvManager').par.Autosetuponstartup = True

# 5. Snapshot currently installed packages back to requirements.txt
op('/YourComp/tdPyEnvManager').par.Exportrequirementstxt.pulse()

# Inspect the lockfile
print(str(op('/YourComp/tdPyEnvManager').par.Status.val))
# → "Environment linked and ready."
```
