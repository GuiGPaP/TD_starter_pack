# Compute Shader Domain — GLSL POPs

## Mental Model

- GLSL POPs are **compute shaders**, not fragment shaders. No `fragColor`, no `vUV`, no `sTD2DInputs` — work with attribute arrays indexed by `TDIndex()`
- Particle/point data lives in **SSBOs**. Input attributes read via functions (`TDIn_P()`), output written to arrays (`P[id] = ...`)
- GPU dispatches in workgroup-sized blocks — some threads exceed element count. Every shader must **bounds-check** with `TDNumElements()`
- Unmodified attributes pass by reference at zero cost — only list attributes you actually modify in "Output Attributes"

## Operator Decision Table

| Operator | Use When | Key Trait |
|---|---|---|
| **GLSL POP** | Modifying one attribute class without changing count | Simplest, single-class |
| **GLSL Advanced POP** | Reading/writing points, verts, AND prims, or changing counts | Most powerful |
| **GLSL Copy POP** | Instancing — duplicating geometry with per-copy transforms | Per-copy shaders |
| **GLSL Select POP** | Picking extra output from GLSL Advanced POP | Utility, no shader |

## Domain-Specific Guardrails

1. **No fragment-shader constructs.** No `out vec4 fragColor`, `vUV`, `sTD2DInputs`, `TDOutputSwizzle()`.
2. **Always bounds-check.** `if (id >= TDNumElements()) return;` prevents SSBO out-of-bounds writes.
3. **Output attributes are arrays, inputs are functions.** Write `P[id] = value;`, read `TDIn_P()`.
4. **List every output attribute.** Must be in operator's "Output Attributes" parameter or they won't exist.
5. **Initialize outputs or write every element.** Uninitialized buffers contain garbage.
6. **Match syntax to operator type.** GLSL POP: `TDIn_P()` / `P[id]`. Advanced POP: `TDInPoint_P()` / `oTDPoint_P[id]`.
7. **Call `TDUpdatePointGroups()` in Copy POP.** Without it, group membership lost. Also `TDUpdateTopology()` in vertex shaders.
8. **Guard division by zero in forces.** Clamp distances with `max(dist, EPSILON)`.

## Key Parameters (glslPOP)

- `computedat` — Compute Shader DAT
- `attrclass` — Attribute class (point, vertex, primitive)
- `initoutputattrs` — Initialize output attributes
- `npasses` — Number of shader passes
- `attr` sequence — Declare new output attributes (name, type)

## Input / Output Attribute Access

### GLSL POP (single class)
```glsl
vec3 pos = TDIn_P();        // read (shorthand)
vec4 col = TDIn_Cd();
P[id] = pos;                // write (arrays)
Cd[id] = col;
```

### GLSL Advanced POP (all classes)
```glsl
vec3 pos = TDInPoint_P();   // class-prefixed read
oTDPoint_P[id] = pos;       // class-prefixed write
```

### GLSL Copy POP
```glsl
uint copyIdx = TDCopyIndex();
P[id] = TDIn_P() + float(copyIdx) * vec3(1.0, 0.0, 0.0);
TDUpdatePointGroups();
```

## POP Attribute Access in GLSL TOP

```glsl
attribType TDBuffer_AttribName(uint elementIndex);
const uint TDBufferLength_AttribName();
```

## Reference Docs

| Your task | Load |
|---|---|
| API functions, best practices, troubleshooting | @references/compute/index.md |
| Shader examples and patterns | @examples/compute/index.md |
| Starting templates | @templates/compute/ (basic-pop, advanced-pop, copy-pop, particle-sim) |
| Text particle systems, POP node workflow (no GLSL) | @references/compute/POP-TEXT-INSTANCING.md |

## Response Format

Always include:
1. **Which POP operator** to use
2. **GLSL Code** with comments
3. **Output Attributes** — which to list in operator parameter
4. **Attribute Class** — Point, Vertex, or Primitive
5. **TouchDesigner Setup** — uniforms, "Initialize Output Attributes", passes, wiring
