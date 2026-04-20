# Pixel Shader Domain — GLSL TOP

## Mental Model

- A GLSL TOP runs a **fragment shader** once per pixel. You write `main()`, TD provides the pipeline.
- TouchDesigner auto-injects variables (`sTD2DInputs`, `vUV`, `vP`, `vN`, `vColor`) — declaring them causes redefinition errors.
- Uniforms are a two-step contract: declare in GLSL (`uniform float uTime;`) **and** configure in the TD parameter UI (Vectors/Colors/CHOP Uniforms page). Missing either side = silent failure.
- `TDOutputSwizzle()` is mandatory on final output — it handles color space conversion.
- TouchDesigner uses **GLSL 4.60** (Vulkan). Do NOT add `#version` directives.

## Domain-Specific Guardrails

1. **`out vec4 fragColor;` must be global.** Declaring inside `main()` produces `undeclared identifier`.
2. **Never declare auto-injected variables.** `sTD2DInputs[]`, `vUV`, `vP`, `vN`, `vColor` are provided by TD.
3. **Always wrap output with `TDOutputSwizzle()`.** Without it, colors are wrong or black.
4. **Uniforms require TD-side configuration.** Declare in GLSL AND set on the GLSL TOP's parameter page.
5. **Cache texture samples.** Each `texture()` call is a GPU memory fetch. Sample once, reuse.

## TD Built-in Samplers (auto-declared — do NOT redeclare)

```glsl
uniform sampler2D sTD2DInputs[TD_NUM_2D_INPUTS];
uniform sampler3D sTD3DInputs[TD_NUM_3D_INPUTS];
uniform sampler2DArray sTD2DArrayInputs[TD_NUM_2D_ARRAY_INPUTS];
uniform samplerCube sTDCubeInputs[TD_NUM_CUBE_INPUTS];
uniform sampler2D sTDNoiseMap;     // 256x256 random data
uniform sampler1D sTDSineLookup;   // 0→1 sine shape
```

## TDTexInfo struct

```glsl
struct TDTexInfo { vec4 res; vec4 depth; };  // res = (1/w, 1/h, w, h)
uniform TDTexInfo uTD2DInfos[TD_NUM_2D_INPUTS];
uniform TDTexInfo uTDOutputInfo;
uniform int uTDCurrentDepth;
uniform int uTDPass;
```

## Compute Shader Mode

Set GLSL TOP Mode to `Compute Shader`. No `fragColor` — use:
```glsl
void TDImageStoreOutput(uint index, ivec3 coord, vec4 color);
vec4 TDImageLoadOutput(uint index, ivec3 coord);
```

## Multiple Color Buffers

Set `# of Color Buffers` > 1. Declare: `layout(location = 1) out vec4 buf1;`. Access via Render Select TOP.

## Non-uniform Sampler Access

Dynamic sampler indexing requires: `texture(sTD2DInputs[nonuniformEXT(idx)], uv);`

## Reference Docs

| Your task | Load |
|---|---|
| API reference, best practices, troubleshooting | @references/pixel/index.md |
| Shader patterns and full examples | @examples/pixel/index.md |
| Starting templates | @templates/pixel/ (basic, generative, multi-input, feedback) |

## Response Format

Always include:
1. **Complete GLSL code** — uniforms, output declaration, helper functions, `main()`
2. **TouchDesigner setup** — parameter page, uniform name/type/value, input connections
3. Use templates as base when creating new shaders
