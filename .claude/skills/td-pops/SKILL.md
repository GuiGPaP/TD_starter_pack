---
name: td-pops
description: Write GLSL compute shaders for TouchDesigner's POP (Point Operator) family — GLSL POP, GLSL Advanced POP, GLSL Copy POP, and GLSL Select POP. Use this skill whenever creating GPU particle systems, point cloud manipulation, geometry processing, point deformation, SOP to POP workflows, particle forces, particle physics on GPU, instancing with GLSL, or any compute-shader work inside TouchDesigner's POP context. Trigger on mentions of GLSL POP, particle shader, point operator, compute shader for particles, point cloud GLSL, POP attributes, SSBO particle data, GLSL Copy POP, GLSL Advanced POP, or any request to manipulate points/vertices/primitives with GLSL in TouchDesigner.
---

# TouchDesigner GLSL POPs — Compute Shader Writing

## Mental Model

- GLSL POPs are **compute shaders**, not fragment shaders. There is no `fragColor`, no `vUV`, no `sTD2DInputs` — you work with attribute arrays indexed by `TDIndex()`
- Particle/point data lives in **SSBOs** (Shader Storage Buffer Objects). Input attributes are read via functions (`TDIn_P()`), output attributes are written to arrays (`P[id] = ...`)
- The GPU dispatches threads in workgroup-sized blocks — some threads exceed the actual element count, so every shader must **bounds-check** with `TDNumElements()`
- Unmodified input attributes pass by reference from input to output at zero cost — only list attributes you actually modify in "Output Attributes"
- Multi-pass shaders read their own previous output when access mode is set to "Read-Write"

## Operator Decision Table

| Operator | Use When | Key Trait |
|---|---|---|
| **GLSL POP** | Modifying one attribute class (points OR verts OR prims) without changing element count | Simplest, single-class processing |
| **GLSL Advanced POP** | Reading/writing points, verts, AND prims simultaneously, or changing element counts | Most powerful, simultaneous multi-class access |
| **GLSL Copy POP** | Instancing — duplicating geometry with per-copy transforms | Separate shaders for points/verts/prims per copy |
| **GLSL Select POP** | Picking an extra output stream from a GLSL Advanced POP | Utility, no shader code needed |

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, consider running `index_td_project` first. Use `@td-context` for the full workflow.

2. **No fragment-shader constructs.** There is no `out vec4 fragColor`, no `vUV`, no `sTD2DInputs`, no `TDOutputSwizzle()`. Those belong to GLSL TOPs/MATs. Using them produces compile errors that look unrelated to the real cause.

3. **Always bounds-check.** `if (id >= TDNumElements()) return;` prevents out-of-bounds SSBO writes. Skipping this causes GPU hangs or crashes with no useful error message.

4. **Output attributes are arrays, inputs are functions.** Write `P[id] = value;`, read `TDIn_P()`. Confusing the two produces undeclared identifier errors.

5. **List every output attribute.** Attributes must be listed in the operator's "Output Attributes" parameter or they won't exist as writable arrays. Missing this causes silent failures — the shader compiles but data disappears.

6. **Initialize outputs or write every element.** Uninitialized output buffers contain garbage. Either enable "Initialize Output Attributes" in the operator parameters, or explicitly write every output element. Reading uninitialized data downstream causes crashes.

7. **Match syntax to operator type.** GLSL POP uses `TDIn_P()` / `P[id]`. GLSL Advanced POP uses `TDInPoint_P()` / `oTDPoint_P[id]`. Mixing them produces undeclared identifier errors.

8. **Call `TDUpdatePointGroups()` in Copy POP.** Without this call, point group membership is silently lost across copies. Similarly, call `TDUpdateTopology()` in vertex shaders and `TDUpdatePrimGroups()` in primitive shaders.

9. **Guard against division by zero in force calculations.** Clamp distances with `max(dist, EPSILON)` — zero-distance singularities produce NaN that propagates to every downstream attribute.

## TD GLSL POP Reference (from official docs)

### Key Parameters (glslPOP)
- `computedat` — Compute Shader DAT
- `attrclass` — Attribute class to process (point, vertex, primitive)
- `initoutputattrs` — Initialize output attributes (copy input defaults)
- `prevpassoutput` — Copy previous pass output to next pass input
- `npasses` — Number of shader passes
- `simplexnoise` — Performance vs Quality TDSimplexNoise()
- `attr` sequence — Declare new output attributes (name, type)
- `input` sequence — Additional input POPs (besides connected ones)

### POP Attribute Access in GLSL TOP
POPs can expose attributes to GLSL TOPs via the Buffer page:
```glsl
attribType TDBuffer_AttribName(uint elementIndex);
attribType TDBuffer_AttribName(uint elementIndex, uint arrayIndex);
const uint TDBufferLength_AttribName();
const uint cTDBufferArraySize_AttribName;
```

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| GLSL patterns (compute, particle) | `search_glsl_patterns` | query + `type: "compute"` |
| Operator params, POP setup | `search_operators` | query "glsl pop" or "particle" |
| TD techniques (particle systems, GPU compute) | `search_techniques` | query + `category: "gpu-compute"` |
| TD network setup, operator wiring | td-guide skill | Use `create_geometry_comp` with `pop=true` |
| General GPU compute, GLSL compute shaders | `mcp__plugin_exa-mcp-server_exa__get_code_context_exa` | `"OpenGL compute shader SSBO workgroup"` |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: guardrails, operator decision table, attribute access patterns, shader structure, template selection
- **Fetch fresh docs** for: specific API signatures not in FUNCTIONS.md, new TD build features, hardware raytracing details, debugging unfamiliar compile errors

## Loading References

This skill uses progressive loading. Follow this sequence:
1. Find the ONE row in the routing table below that matches your task
2. Load that file only
3. If it is an index, pick the ONE sub-file that matches and load it

If you discover mid-task that you need a second reference, load it then.

## Reference Docs

| Your task | Load |
|---|---|
| API functions, best practices, troubleshooting | @references/index.md |
| Shader examples and patterns | @examples/index.md |
| Starting from a template | @templates/ (basic-pop.glsl, advanced-pop.glsl, copy-pop.glsl, particle-sim.glsl) |
| Text particle systems, UVW instancing, POP node workflow (no GLSL) | @references/POP-TEXT-INSTANCING.md |

## Input / Output Attribute Access

### GLSL POP (single attribute class)

```glsl
// Reading (shorthand defaults: inputIndex=0, elementId=TDIndex(), arrayIndex=0)
vec3 pos = TDIn_P();
vec4 col = TDIn_Cd();

// Writing (arrays — must be declared in Output Attributes)
P[id] = pos;
Cd[id] = col;
```

### GLSL Advanced POP (all classes simultaneously)

```glsl
// Reading — class-prefixed functions
vec3 pos = TDInPoint_P();
vec3 nrm = TDInVert_N();

// Writing — class-prefixed arrays
oTDPoint_P[id] = pos;
oTDVert_N[id]  = nrm;
```

### GLSL Copy POP

```glsl
uint copyIdx = TDCopyIndex();
P[id] = TDIn_P() + float(copyIdx) * vec3(1.0, 0.0, 0.0);
TDUpdatePointGroups();
```

## Response Format

When providing GLSL POP shaders, always include:

1. **Which POP operator** to use (GLSL POP, GLSL Advanced POP, or GLSL Copy POP)
2. **GLSL Code** with comments explaining each section
3. **Output Attributes** — which attributes to list in the operator parameter (e.g., `P v Cd`)
4. **Attribute Class** — Point, Vertex, or Primitive (for GLSL POP)
5. **TouchDesigner Setup** — uniform names/types/values, whether to enable "Initialize Output Attributes", number of passes, operator wiring
