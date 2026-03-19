---
name: td-glsl-vertex
description: Write GLSL vertex shaders for TouchDesigner's GLSL MAT operator. Use whenever creating 3D materials, vertex displacement, geometry deformation, mesh animation, instancing effects, custom surface normals, or any shader that manipulates vertex data in 3D space. Also covers the complete vertex + pixel shader pair for GLSL MAT. Trigger when the user mentions GLSL MAT, vertex shader, vertex displacement, mesh deformation, instancing in TouchDesigner, 3D material writing, surface normals in GLSL, or wants to create a custom material for a SOP/geometry node.
---

# TouchDesigner GLSL MAT — Vertex Shader Writing

## Mental Model

- GLSL MAT applies to 3D geometry and requires **two DATs**: a vertex shader and a pixel shader. Both are mandatory.
- The vertex shader transforms positions from object space to clip space. The standard chain is: `gl_Position = TDWorldToProj(TDDeform(P));`
- `TDDeform(P)` is the critical function — it applies instancing, skinning, and bones. Skipping it breaks instancing silently.
- Varyings (`out` in vertex, `in` in pixel) are the only way to pass data between stages. The GPU interpolates them across triangles.
- A custom vertex shader **replaces** TD's default varyings (`vUV`, `vP`, `vN`, `vColor`). If your pixel shader needs UVs, your vertex shader must explicitly pass them.

## Critical Guardrails

1. **Never declare TD attributes.** `P`, `N`, `uv[0]`, `Cd`, `T` are auto-injected. Declaring them causes `'P' : redefinition` errors.

2. **Always call `TDDeform(P)`.** Without it, instancing and skinning are silently bypassed — geometry renders at origin. Every vertex shader must route positions through `TDDeform` before `TDWorldToProj`.

3. **Always match varyings exactly.** Every `out` in the vertex shader needs a corresponding `in` in the pixel shader with the same name and type. Mismatches cause link errors.

4. **No `#version` directive.** TouchDesigner injects it automatically. Adding one causes a compile error.

5. **Use `layout(location = 0)` on pixel output.** GLSL MAT requires `layout(location = 0) out vec4 fragColor;` — unlike GLSL TOP which omits the layout qualifier.

6. **Transform normals with `worldForNormals`.** Using `mat3(world)` breaks under non-uniform scale. Use `uTDMats[TDCameraIndex()].worldForNormals * N` or `TDDeformNorm(N)` for instanced geometry.

7. **Custom VS replaces default varyings.** Once you supply a vertex shader, `vUV`, `vP`, `vN`, `vColor` stop existing. Declare and write every varying your pixel shader reads.

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| TD GLSL MAT API (TDDeform, uTDMats, instancing) | `mcp__Context7__query-docs` | Resolve `"touchdesigner"` first, then query |
| TD network setup, Render TOP, instancing config | td-guide skill | Route through td-guide's reference table |
| GLSL language features, built-in functions | `mcp__exa__get_code_context_exa` | Query with GLSL version context |
| Shader debugging, OpenGL errors | `mcp__exa__web_search_exa` | Search with TD + error message |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: transform pipeline, guardrails, varying patterns, TD-specific functions
- **Fetch fresh docs** for: exact function signatures you haven't used before, new TD versions, OpenGL spec details

## Loading References

This skill uses progressive loading. Follow this sequence:
1. Find the ONE row in the routing table below that matches your task
2. Load that file only
3. If it is an index, pick the ONE sub-file that matches and load it

## Reference Docs

| Your task | Reference |
|---|---|
| TD vertex functions, attributes, uniforms, matrices | @references/VERTEX-API.md |
| Passing data vertex to pixel (varyings, interpolation, TBN) | @references/VARYINGS.md |
| Phong, PBR, or unlit lighting in pixel shaders | @references/LIGHTING.md |
| Debugging errors (black geometry, broken normals, link failures) | @references/TROUBLESHOOTING.md |
| Full working vertex + pixel shader pairs | @examples/COMPLETE.md |
| Quick-reference vertex patterns (displacement, wave, instancing) | @examples/PATTERNS.md |

## Response Format

When writing a GLSL MAT shader, always provide:

1. **Vertex Shader** — complete GLSL code with comments
2. **Pixel Shader** — complete GLSL code, matching all varyings
3. **TouchDesigner Setup**:
   - Load Page: which DAT goes in Vertex Shader / Pixel Shader fields
   - Uniforms: parameter page, name, type, value or expression
   - Render setup notes if instancing or lighting is involved
