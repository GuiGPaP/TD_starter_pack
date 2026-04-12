---
name: td-glsl
description: Write GLSL pixel/fragment shaders for TouchDesigner's GLSL TOP operator. Use this skill whenever creating pixel shaders, post-processing effects, image filters, texture effects, UV distortion, noise patterns, color correction, blur, feedback shaders, generative textures, chromatic aberration, or any 2D image processing in TouchDesigner. Also use when debugging GLSL TOP compilation errors or optimizing shader performance. NOT for vertex shaders (use td-glsl-vertex) or compute/particle shaders (use td-pops).
---

# TouchDesigner GLSL TOP — Pixel Shader Writing

> **Cache rule**: If you already loaded this skill or read a reference file in the current conversation, do NOT re-read it. Use your memory of the content.

> **Post-write rule**: After ANY `set_dat_text` on a GLSL DAT, call `validate_glsl_dat` immediately. Fix and re-write if validation fails. Never consider shader code done without validation. Skip validation for data DATs (JSON, CSV, plain text).

> **Execution mode rule**: Default to `read-only` mode for `execute_python_script` when inspecting shaders or uniforms. Only escalate to `safe-write` when creating operators.

## Mental Model

- A GLSL TOP runs a **fragment shader** once per pixel. You write `main()`, TouchDesigner provides the pipeline (vertex stage, uniforms injection, output routing).
- TouchDesigner auto-injects variables (`sTD2DInputs`, `vUV`, `vP`, `vN`, `vColor`) — declaring them yourself causes redefinition errors.
- Uniforms are a two-step contract: declare in GLSL (`uniform float uTime;`) **and** configure in the TD parameter UI (Vectors/Colors/CHOP Uniforms page). Missing either side = silent failure.
- `TDOutputSwizzle()` is mandatory on final output — it handles color space conversion. Omitting it produces wrong colors.
- TouchDesigner uses **GLSL 4.60** (Vulkan). Support for 3.30 and earlier was removed. Do NOT add `#version` directives — TD injects its own and a second one causes a compilation error.

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, consider running `index_td_project` first. Use `@td-context` for the full workflow.

2. **`out vec4 fragColor;` must be global.** Declaring it inside `main()` produces `'fragColor' : undeclared identifier`. WHY: GLSL requires output variables at file scope.

3. **Never declare auto-injected variables.** `sTD2DInputs[]`, `vUV`, `vP`, `vN`, `vColor` are provided by TD. Redeclaring them causes `redefinition` errors.

4. **Always wrap output with `TDOutputSwizzle()`.** `fragColor = color;` without swizzle produces incorrect colors or black output. WHY: TD needs to apply color space and channel mapping.

5. **No `#version` directive.** TouchDesigner injects its own `#version` header. Adding one causes `#version must occur before any other statement`. WHY: the TD compiler prepends its own version line.

6. **Uniforms require TD-side configuration.** Declaring `uniform float uTime;` in GLSL is not enough — you must also set the name, type, and value/expression on the GLSL TOP's parameter page. Unused uniforms get optimized away by the compiler.

7. **Guard `normalize()` against zero-length vectors.** `normalize(vec2(0.0))` is undefined behavior and produces NaN. Always check `length() > 0.0` first. WHY: common in radial effects when UV equals center.

8. **Cache texture samples.** Each `texture()` call is a GPU memory fetch. Sample once into a variable, access `.rgb`/`.a` from the cached result. WHY: redundant fetches at the same UV are pure waste.

## TD Built-in GLSL Reference (from official docs)

### Samplers (auto-declared — do NOT redeclare)
```glsl
uniform sampler2D sTD2DInputs[TD_NUM_2D_INPUTS];
uniform sampler3D sTD3DInputs[TD_NUM_3D_INPUTS];
uniform sampler2DArray sTD2DArrayInputs[TD_NUM_2D_ARRAY_INPUTS];
uniform samplerCube sTDCubeInputs[TD_NUM_CUBE_INPUTS];
uniform sampler2D sTDNoiseMap;     // 256x256 random data
uniform sampler1D sTDSineLookup;   // 0→1 sine shape
```

### TDTexInfo struct (resolution info)
```glsl
struct TDTexInfo { vec4 res; vec4 depth; };  // res = (1/w, 1/h, w, h)
uniform TDTexInfo uTD2DInfos[TD_NUM_2D_INPUTS];
uniform TDTexInfo uTDOutputInfo;   // output resolution
uniform int uTDCurrentDepth;       // current slice index (3D/2DArray output)
uniform int uTDPass;               // current pass (multi-pass)
```

### Built-in Functions
```glsl
vec4 TDOutputSwizzle(vec4 c);           // MANDATORY on pixel shader output
float TDPerlinNoise(vec2/vec3/vec4 v);  // [-1, 1]
float TDSimplexNoise(vec2/vec3/vec4 v); // [-1, 1]
vec3 TDHSVToRGB(vec3 c);  vec3 TDRGBToHSV(vec3 c);
vec4 TDDither(vec4 color);              // anti-banding noise
mat4 TDTranslate(float x, float y, float z);
mat3 TDRotateX/Y/Z(float radians);
mat3 TDRotateOnAxis(float radians, vec3 axis); // axis must be normalized
mat3 TDScale(float x, float y, float z);
mat3 TDRotateToVector(vec3 forward, vec3 up);
```

### Compute Shader Mode
Set GLSL TOP Mode to `Compute Shader`. No `fragColor` — use `TDImageStoreOutput`:
```glsl
void TDImageStoreOutput(uint index, ivec3 coord, vec4 color); // auto-applies swizzle
vec4 TDImageLoadOutput(uint index, ivec3 coord);
```

### Multiple Color Buffers
Set `# of Color Buffers` > 1. Declare extra outputs: `layout(location = 1) out vec4 buf1;`. Access extras via Render Select TOP.

### Non-uniform Sampler Access
Dynamic sampler indexing requires `nonuniformEXT()`: `texture(sTD2DInputs[nonuniformEXT(idx)], uv);`

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| GLSL patterns in our knowledge base | `search_glsl_patterns` | query + type/difficulty/tags filters |
| Operator params, examples | `search_operators` | query "glsl" or "noise" etc. |
| TD techniques (audio-reactive, feedback, etc.) | `search_techniques` | query + category filter |
| TD version features, breaking changes | `get_version_info` / `list_versions` | version ID |
| GLSL language spec, advanced features | `mcp__plugin_exa-mcp-server_exa__get_code_context_exa` | `"GLSL [function] specification"` |
| Shader algorithms, visual effects | `mcp__plugin_exa-mcp-server_exa__get_code_context_exa` | `"GLSL [effect name] shader tutorial"` |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: guardrails, built-in reference above, TD-specific patterns, uniform workflow, templates
- **Fetch fresh docs** for: specific function signatures not listed here, advanced GLSL features, new TD version changes, unfamiliar shader algorithms

## Loading References

This skill uses progressive loading. Follow this sequence:
1. Find the ONE row in the routing table below that matches your task
2. Load that file only
3. If it is an index, pick the ONE sub-file that matches and load it

If you discover mid-task that you need a second reference, load it then.

## Reference Docs

| Your task | Load |
|---|---|
| API reference, best practices, troubleshooting | @references/index.md |
| Shader patterns and full examples | @examples/index.md |

## Response Format

When providing shaders, always include:

1. **Complete GLSL code** — uniforms, output declaration, helper functions, `main()`
2. **TouchDesigner setup instructions**:
   - Which parameter page (Vectors, Colors, CHOP Uniforms)
   - Uniform name, type, and value/expression (e.g., `absTime.seconds`)
   - Input connections (which TOPs to wire to which input index)
3. **Starter templates** are in `templates/` — use them as the base when creating new shaders:
   - `templates/basic.glsl` — minimal texture pass-through
   - `templates/generative.glsl` — pattern generation without inputs
   - `templates/multi-input.glsl` — compositing multiple inputs
   - `templates/feedback.glsl` — feedback loop with decay
