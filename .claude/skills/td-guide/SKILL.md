---
name: td-guide
description: "TouchDesigner network creation, operator layout, rendering, data conversion, and MCP API usage. Use this skill whenever creating TD networks, operators, components, cameras, lights, materials, feedback loops, instancing, data conversion between families, Python scripting via MCP, or debugging operator errors. Also use when the user mentions TOPs, SOPs, CHOPs, DATs, COMPs, POPs, Geometry COMP, Render TOP, or any TD operator type. Routes to td-glsl, td-glsl-vertex, and td-pops for shader work."
---

# TouchDesigner Guide

## Mental Model

- TD is a visual dataflow environment: operators process data, connections define the graph, families (SOP/TOP/CHOP/DAT/COMP/POP) define data types
- Every operator belongs to exactly one family; cross-family data transfer requires explicit conversion operators (e.g., `soptoCHOP`, `choptoTOP`)
- Geometry COMP is the bridge between SOP/POP geometry and the render pipeline — shapes are prepared outside, passed in via In/Out
- The MCP API exposes TD's Python runtime — prefer high-level MCP tools (`create_geometry_comp`, `create_feedback_loop`, `configure_instancing`) over raw `execute_python_script`
- Your pre-trained TD knowledge is unreliable. Always verify against this skill, reference files, and runtime introspection before writing code

## GLSL Skill Routing

For shader work, use the specialized skill — do not attempt GLSL in td-guide:

| Task | Skill |
|------|-------|
| Pixel shader / GLSL TOP / 2D image effects / generative textures / feedback | **td-glsl** |
| Vertex shader / GLSL MAT / 3D materials / displacement / instancing | **td-glsl-vertex** |
| Compute shader / particles / GLSL POP / SSBOs / point clouds | **td-pops** |

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, consider running `index_td_project` first. Use `@td-context` for the full workflow.

2. **Pre-trained knowledge is wrong.** TD parameter names, operator types, and API patterns in your training data are frequently incorrect. Always read references and verify parameters with `get_node_parameter_schema` or `[p.name for p in op('/path').pars()]` before writing code.

3. **`parent` is a string, not an OP.** In `execute_python_script`, `parent` is injected as a string path. `parent.create(...)` will crash. Always resolve to an OP first: `base = op('/project1/base1')`.

4. **Error cache is frame-delayed.** TD updates error state on frame boundaries. Fix errors in one `execute_python_script` call, then check errors in a separate call — same-call checks return stale state.

5. **Always set `viewer = True`.** Matches UI-created operator behavior. Without it, operators appear collapsed and are hard to debug visually.

6. **GLSL ops have docked DATs.** Setting `nodeX`/`nodeY` on a GLSL TOP/MAT does NOT move its docked DATs (`_pixel`, `_vertex`). Use `move_with_docked()` or `td_helpers.layout.move_with_docked`.

7. **Geometry COMP: shapes go outside.** Create geometry at the parent level and pass it in via In/Out operators. Do not create shapes inside the COMP or reference parent ops with `../`.

8. **Use Null as intermediary.** Before any reference connection, insert a Null operator. This makes networks modular and debuggable.

9. **Check parameter bindings before modifying.** Parameters can be bound by reference to a parent COMP or another operator (`par.mode == ParMode.BIND`). Modifying a bound parameter directly can break the binding or propagate the change unexpectedly. Before any `par.xxx = value`, check `par.mode` and `par.bindExpr` — if bound, modify the source instead.

10. **`create()` prend des strings, pas des classes.** `comp.create('geometryCOMP', 'myGeo')` et non `comp.create(geometryCOMP, 'myGeo')`. Les classes TD Python (`geometryCOMP`, `textDAT`, `noiseTOP`) ne sont pas dans le namespace des scripts MCP. Noms courants : `'geometryCOMP'`, `'baseCOMP'`, `'containerCOMP'`, `'textDAT'`, `'tableDAT'`, `'nullDAT'`, `'selectDAT'`, `'noiseTOP'`, `'textTOP'`, `'nullCHOP'`, `'audiodeviceinCHOP'`.

11. **`allowCooking` ne s'applique qu'aux COMPs.** `op.allowCooking = False` crashe sur les DATs/TOPs/CHOPs/SOPs. Toujours vérifier : `if copy.isCOMP: copy.allowCooking = False`.

12. **`/project1` peut ne pas exister.** Le COMP principal peut s'appeler `/ProjectName`, `/myProject`, etc. Toujours vérifier avec `op('/').children` avant de cibler un chemin.

13. **`findChildren()` depuis `/` ne traverse pas les privacy flags.** Scanner chaque conteneur de premier niveau séparément plutôt que `op('/').findChildren(depth=10)`.

14. **COMP connectors ≠ DAT connectors.** Les `inputConnectors` d'un baseCOMP/containerCOMP attendent des connexions COMP-à-COMP. On ne peut pas connecter un DAT directement à un COMP connector. Pour passer des données DAT à un COMP, utiliser les paramètres du COMP (`par.dat = dat.path`) ou placer le DAT à l'intérieur et le connecter au `in1` interne.

15. **Ne pas deviner les noms de paramètres.** `opviewerTOP.par.comp` n'existe pas — c'est `par.opviewer`. Toujours vérifier avec `[p.name for p in op.pars()]` ou `get_node_parameter_schema` avant d'écrire un paramètre sur un opérateur inconnu.

16. **Geo COMP crée un torus par défaut.** Un `geometryCOMP` créé via `create()` contient automatiquement un `torus1` SOP. Le supprimer si non désiré : `geo.op('torus1').destroy()`.

## Python Utilities Routing

| Task | Skill |
|------|-------|
| TDFunctions, TDJSON, TDStoreTools, TDResources usage | **td-python** |

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| TD Python API (`op`, `par`, `COMP` methods) | `mcp__Context7__query-docs` | Resolve `"derivative/touchdesigner"`, then query |
| Parameter names, types, ranges for a node | `get_node_parameter_schema` | Pass `nodePath` + optional `pattern` filter |
| Operator paths and references | `complete_op_paths` | Pass `contextNodePath` + `prefix` |
| CHOP channel names and stats | `get_chop_channels` | Pass `nodePath`, set `includeStats=true` |
| TD patterns, community examples | `mcp__exa__get_code_context_exa` | Natural language query |
| General TD research, changelogs | `mcp__exa__web_search_exa` | Semantic search |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: guardrails, network patterns, operator creation recipes, MCP API usage, layout rules
- **Fetch fresh docs** for: specific parameter names on unfamiliar operators, new TD features, Python API signatures you haven't verified

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
2. If creating a network: describe the operator chain before writing code
3. Use `execute_python_script` code blocks with full paths resolved from `op()`
4. After creation: check errors with `get_td_node_errors` or `op('/path').errors(recurse=True)` in a separate call
5. Show final network layout as a simple ASCII flow diagram
