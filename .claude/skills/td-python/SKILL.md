---
name: td-python
description: "TouchDesigner Python utility modules: TDFunctions, TDJSON, TDStoreTools, TDResources. Use this skill when serializing TD objects to JSON, round-tripping parameters via JSON, using StorageManager or DependDict/DependList, creating PopMenu or PopDialog, downloading files with op.TDResources, using TDFunctions helpers for paths/layout/params/menus, or avoiding silent failures in these modules. Also use when you see imports of TDFunctions, TDJSON, TDStoreTools, or references to op.TDResources, StorageManager, DependDict, serializeTDData, textToJSON, datToJSON, parameterToJSONPar, createProperty, PopMenu, PopDialog, WebClient, FileDownloader."
---

# TD Python Utilities

## Mental Model

- **TDJSON > json** for TD data — it handles Par, Cell, Channel, OP references that `json.dumps` cannot
- **TDStoreTools** = structured storage tied to COMP lifecycle — StorageManager keeps `me.store` in sync with a schema, DependDict/DependList trigger cook when read
- **TDFunctions** = grab-bag of helpers that prevent reinventing the wheel — paths, layout, params, menus, tScript bridge
- **TDResources** = singleton system COMP (`op.TDResources`) exposing UI popups (PopMenu, PopDialog), HTTP (WebClient), file I/O (FileDownloader), and MouseCHOP
- These modules have **specific failure modes**: silent None returns, class-level mutations, destructive flags enabled by default

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, consider running `index_td_project` first. Use `@td-context` for the full workflow.

2. **TDJSON over json for TD data.** `json.dumps` cannot serialize Par, Cell, Channel, or OP objects. Use `TDJSON.serializeTDData(data)` which maps TD types to JSON-safe values. **WHY:** `json.dumps` raises TypeError on TD types with no useful message.

3. **textToJSON/datToJSON return None on failure.** These functions do not raise exceptions — they return `None` and print to textport. Always null-check the result before using it. **WHY:** Silent None propagates as AttributeError far from the actual parse failure.

4. **destroyOthers=True deletes everything not in the JSON.** `COMP.loadChildrenFromJSONDict` with `destroyOthers=True` (NOT the default, but commonly passed) removes all child operators not present in the dict. **WHY:** Accidentally wipes user-created operators in the target COMP.

5. **StorageManager sync=True erases unlisted items.** When `StorageManager.Init(comp, items, sync=True)`, any storage key not in `items` is deleted. **WHY:** Adding a StorageManager to a COMP that already has manual `me.store` entries silently destroys them.

6. **StorageManager is keyed by class name, not instance.** The internal key is `type(ext).__name__`. Two extensions with the same class name sharing a COMP will collide. **WHY:** Storage items from one extension overwrite the other with no warning.

7. **createProperty() adds to the CLASS, not the instance.** `TDFunctions.createProperty(ext, name, ...)` uses `type(ext)` — the property is shared across all instances of that extension class. **WHY:** In replicated COMPs, setting a property on one instance changes all of them.

8. **DependDict/DependList are expensive — use plain dict/list unless cook-reactivity is needed.** Every read from a DependDict marks the reader as dependent, triggering downstream cooks on any write. **WHY:** Unnecessary DependDict in a high-frequency callback causes cascade cooks every frame.

9. **tScript() creates and destroys a textDAT per call.** `TDFunctions.tScript(cmd)` is a bridge to legacy tscript — it creates a temporary DAT, runs the command, reads output, then deletes. **WHY:** Extremely slow in loops; use Python API equivalents instead.

10. **applyParInfo() is silent by default.** Returns a list of parameter names that failed to apply, but does not raise. Always check the return value. **WHY:** Typos in parameter names or type mismatches silently do nothing.

11. **Check par.mode before modifying values.** If `par.mode` is `ParMode.BIND` or `ParMode.EXPRESSION`, setting `par.val` overwrites the binding/expression. **WHY:** Destroys carefully authored references — check mode first, modify the source if bound.

## Python Utilities Routing

For tasks outside these 4 modules, use the appropriate skill:

| Task | Skill |
|------|-------|
| Python environment, imports, threading, subprocess | **td-guide** → `python-environment.md` |
| Python code style, ruff rules, DAT conventions | **td-lint** → `td-python-patterns.md` |

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| TD Python API (`op`, `par`, `COMP` methods) | `mcp__Context7__query-docs` | Resolve `"derivative/touchdesigner"`, then query |
| Exact function signatures in TDFunctions/TDJSON | `mcp__Context7__query-docs` | Query with module + function name |
| Parameter names on a specific node | `get_node_parameter_schema` | Pass `nodePath` + optional `pattern` |
| Community patterns for StorageManager | `mcp__exa__web_search_exa` | Semantic search |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: guardrails, flag semantics, silent failure patterns, decision tables, good/bad pairs
- **Fetch fresh docs** for: exact function signatures you haven't verified, new TD version changes, third-party extension patterns

## Loading References

This skill uses progressive loading. Follow this sequence:
1. Find the ONE row in the routing table below that matches your task
2. Load that file only
3. If it is an index, pick the ONE sub-file that matches and load it

If you discover mid-task that you need a second reference, load it then.

## Reference Docs

Load @references/index.md and pick the ONE file that matches your task.

## Response Format

1. State which reference(s) you loaded
2. Show the correct pattern with a code block — always include the null-check or flag guard
3. If the user's approach has a silent failure mode, show the bad pattern first with a comment explaining what goes wrong
4. Reference the specific guardrail number when warning about a pitfall
