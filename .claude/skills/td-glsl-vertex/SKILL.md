---
name: td-glsl-vertex
description: Write GLSL vertex shaders for TouchDesigner's GLSL MAT operator. Use whenever creating 3D materials, vertex displacement, geometry deformation, mesh animation, instancing effects, custom surface normals, or any shader that manipulates vertex data in 3D space. Also covers the complete vertex + pixel shader pair for GLSL MAT. Trigger when the user mentions GLSL MAT, vertex shader, vertex displacement, mesh deformation, instancing in TouchDesigner, 3D material writing, surface normals in GLSL, or wants to create a custom material for a SOP/geometry node.
---

# TouchDesigner GLSL MAT — Vertex Shader Writing

> **Cache rule**: If you already loaded this skill or read a reference file in the current conversation, do NOT re-read it. Use your memory of the content.

## Mental Model

- GLSL MAT applies to 3D geometry and requires **two DATs**: a vertex shader and a pixel shader. Both are mandatory.
- The vertex shader transforms positions from object space to clip space. The standard chain is: `gl_Position = TDWorldToProj(TDDeform(P));`
- `TDDeform(P)` is the critical function — it applies instancing, skinning, and bones. Skipping it breaks instancing silently.
- Varyings (`out` in vertex, `in` in pixel) are the only way to pass data between stages. The GPU interpolates them across triangles.
- A custom vertex shader **replaces** TD's default varyings (`vUV`, `vP`, `vN`, `vColor`). If your pixel shader needs UVs, your vertex shader must explicitly pass them.

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, consider running `index_td_project` first. Use `@td-context` for the full workflow.

2. **Never declare TD attributes.** `P`, `N`, `uv[0]`, `Cd`, `T` are auto-injected. Declaring them causes `'P' : redefinition` errors.

3. **Always call `TDDeform(P)`.** Without it, instancing and skinning are silently bypassed — geometry renders at origin. Every vertex shader must route positions through `TDDeform` before `TDWorldToProj`.

4. **Always match varyings exactly.** Every `out` in the vertex shader needs a corresponding `in` in the pixel shader with the same name and type. Mismatches cause link errors.

5. **No `#version` directive.** TouchDesigner injects it automatically. Adding one causes a compile error.

6. **Use `layout(location = 0)` on pixel output.** GLSL MAT requires `layout(location = 0) out vec4 fragColor;` — unlike GLSL TOP which omits the layout qualifier.

7. **Transform normals with `worldForNormals`.** Using `mat3(world)` breaks under non-uniform scale. Use `uTDMats[TDCameraIndex()].worldForNormals * N` or `TDDeformNorm(N)` for instanced geometry.

8. **Custom VS replaces default varyings.** Once you supply a vertex shader, `vUV`, `vP`, `vN`, `vColor` stop existing. Declare and write every varying your pixel shader reads.

## TD GLSL MAT Reference (from official docs)

### Key Parameters (glslMAT)
- `glslversion` — GLSL version (4.60 default, Vulkan)
- `vdat` — Vertex Shader DAT
- `pdat` — Pixel Shader DAT
- `gdat` — Geometry Shader DAT (optional)
- `predat` — Preprocess Directives DAT (#extension, #define)
- `inherit` — Inherit uniforms/samplers from another GLSL MAT
- `dodeform` — Enable deforms (skinning/bones)
- `lightingspace` — World Space (default) or legacy Camera Space

### POP Attribute Access in GLSL MAT
Declare attributes via the 'Attributes' page (not in shader code). Access via:
```glsl
TDAttrib_AttribName()           // for the current vertex
TDAttrib_AttribName(vertexIdx)  // for any vertex (POPs only)
TDTexAttrib_AttribName(layer)   // returns TDAttrib for POPs, uv[layer] for SOPs
```

### Sampler/Texture Setup
Unlike GLSL TOP, GLSL MAT samplers are configured via the Samplers sequence parameter (name + TOP reference), not auto-detected from inputs.

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| GLSL patterns (vertex, displacement, instancing) | `search_glsl_patterns` | query + `type: "vertex"` |
| Operator params, render setup | `search_operators` | query "render" or "glsl" |
| TD techniques (instancing, materials) | `search_techniques` | query + category |
| TD network setup, Render TOP, instancing config | td-guide skill | Route through td-guide |
| GLSL language features | `mcp__plugin_exa-mcp-server_exa__get_code_context_exa` | Query with GLSL context |
| Shader debugging, Vulkan errors | `mcp__plugin_exa-mcp-server_exa__get_code_context_exa` | TD + error message |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: transform pipeline, guardrails, varying patterns, TD-specific functions, POP attribute access
- **Fetch fresh docs** for: exact function signatures you haven't used before, new TD versions, Vulkan spec details

## Loading References

This skill uses progressive loading. Follow this sequence:
1. Find the ONE row in the routing table below that matches your task
2. Load that file only
3. If it is an index, pick the ONE sub-file that matches and load it

## Reference Docs

| Your task | Load |
|---|---|
| API reference, varyings, lighting, troubleshooting | @references/index.md |
| Shader examples and patterns | @examples/index.md |

## Response Format

When writing a GLSL MAT shader, always provide:

1. **Vertex Shader** — complete GLSL code with comments
2. **Pixel Shader** — complete GLSL code, matching all varyings
3. **TouchDesigner Setup**:
   - Load Page: which DAT goes in Vertex Shader / Pixel Shader fields
   - Uniforms: parameter page, name, type, value or expression
   - Render setup notes if instancing or lighting is involved
