# Vertex Shader Domain — GLSL MAT

## Mental Model

- GLSL MAT applies to 3D geometry and requires **two DATs**: a vertex shader and a pixel shader. Both mandatory.
- The vertex shader transforms positions: `gl_Position = TDWorldToProj(TDDeform(P));`
- `TDDeform(P)` is critical — it applies instancing, skinning, and bones. Skipping it breaks instancing silently.
- Varyings (`out` in vertex, `in` in pixel) are the only way to pass data between stages. GPU interpolates across triangles.
- A custom vertex shader **replaces** TD's default varyings. If your pixel shader needs UVs, your vertex shader must pass them.

## Domain-Specific Guardrails

1. **Never declare TD attributes.** `P`, `N`, `uv[0]`, `Cd`, `T` are auto-injected. Redeclaring causes errors.
2. **Always call `TDDeform(P)`.** Without it, instancing/skinning bypassed — geometry at origin.
3. **Always match varyings exactly.** Every `out` in vertex needs matching `in` in pixel (same name + type).
4. **Use `layout(location = 0)` on pixel output.** GLSL MAT requires it, unlike GLSL TOP.
5. **Transform normals with `worldForNormals`.** `mat3(world)` breaks under non-uniform scale. Use `uTDMats[TDCameraIndex()].worldForNormals * N` or `TDDeformNorm(N)`.
6. **Custom VS replaces default varyings.** `vUV`, `vP`, `vN`, `vColor` stop existing. Declare every varying your pixel shader reads.

## Key Parameters (glslMAT)

- `vdat` — Vertex Shader DAT
- `pdat` — Pixel Shader DAT
- `gdat` — Geometry Shader DAT (optional)
- `predat` — Preprocess Directives DAT
- `dodeform` — Enable deforms (skinning/bones)
- `lightingspace` — World Space (default) or Camera Space

## POP Attribute Access in GLSL MAT

```glsl
TDAttrib_AttribName()           // current vertex
TDAttrib_AttribName(vertexIdx)  // any vertex (POPs only)
TDTexAttrib_AttribName(layer)   // returns TDAttrib for POPs, uv[layer] for SOPs
```

## Sampler/Texture Setup

Unlike GLSL TOP, GLSL MAT samplers are configured via the Samplers sequence parameter (name + TOP reference), not auto-detected from inputs.

## Reference Docs

| Your task | Load |
|---|---|
| API reference, varyings, lighting, troubleshooting | @references/vertex/index.md |
| Shader examples and patterns | @examples/vertex/index.md |
| Starting templates | @templates/vertex/ (basic, lit, instancing, displacement) |

## Response Format

Always provide:
1. **Vertex Shader** — complete GLSL code with comments
2. **Pixel Shader** — complete GLSL code, matching all varyings
3. **TouchDesigner Setup** — Load Page DAT assignments, uniforms, render setup notes
