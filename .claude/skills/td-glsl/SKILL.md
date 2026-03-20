---
name: td-glsl
description: Write GLSL pixel/fragment shaders for TouchDesigner's GLSL TOP operator. Use this skill whenever creating pixel shaders, post-processing effects, image filters, texture effects, UV distortion, noise patterns, color correction, blur, feedback shaders, generative textures, chromatic aberration, or any 2D image processing in TouchDesigner. Also use when debugging GLSL TOP compilation errors or optimizing shader performance. NOT for vertex shaders (use td-glsl-vertex) or compute/particle shaders (use td-pops).
---

# TouchDesigner GLSL TOP — Pixel Shader Writing

## Mental Model

- A GLSL TOP runs a **fragment shader** once per pixel. You write `main()`, TouchDesigner provides the pipeline (vertex stage, uniforms injection, output routing).
- TouchDesigner auto-injects variables (`sTD2DInputs`, `vUV`, `vP`, `vN`, `vColor`) — declaring them yourself causes redefinition errors.
- Uniforms are a two-step contract: declare in GLSL (`uniform float uTime;`) **and** configure in the TD parameter UI (Vectors/Colors/CHOP Uniforms page). Missing either side = silent failure.
- `TDOutputSwizzle()` is mandatory on final output — it handles color space conversion. Omitting it produces wrong colors.
- TouchDesigner uses GLSL 3.30+ internally. Do NOT add `#version` directives — TD injects its own and a second one causes a compilation error.

## Critical Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, consider running `index_td_project` first. Use `@td-context` for the full workflow.

2. **`out vec4 fragColor;` must be global.** Declaring it inside `main()` produces `'fragColor' : undeclared identifier`. WHY: GLSL requires output variables at file scope.

3. **Never declare auto-injected variables.** `sTD2DInputs[]`, `vUV`, `vP`, `vN`, `vColor` are provided by TD. Redeclaring them causes `redefinition` errors.

4. **Always wrap output with `TDOutputSwizzle()`.** `fragColor = color;` without swizzle produces incorrect colors or black output. WHY: TD needs to apply color space and channel mapping.

5. **No `#version` directive.** TouchDesigner injects its own `#version` header. Adding one causes `#version must occur before any other statement`. WHY: the TD compiler prepends its own version line.

6. **Uniforms require TD-side configuration.** Declaring `uniform float uTime;` in GLSL is not enough — you must also set the name, type, and value/expression on the GLSL TOP's parameter page. Unused uniforms get optimized away by the compiler.

7. **Guard `normalize()` against zero-length vectors.** `normalize(vec2(0.0))` is undefined behavior and produces NaN. Always check `length() > 0.0` first. WHY: common in radial effects when UV equals center.

8. **Cache texture samples.** Each `texture()` call is a GPU memory fetch. Sample once into a variable, access `.rgb`/`.a` from the cached result. WHY: redundant fetches at the same UV are pure waste.

## Fetching Documentation

### Which tool for which question

| Question domain | Tool to use | How |
|---|---|---|
| TD built-in GLSL functions, sTD2DInputs, TDOutputSwizzle | `mcp__Context7__query-docs` | Resolve `"touchdesigner"`, query with function name |
| GLSL language features, built-in functions | `mcp__exa__get_code_context_exa` | `"GLSL [function] specification"` |
| Shader techniques, algorithms, visual effects | `mcp__exa__get_code_context_exa` | `"GLSL [effect name] shader tutorial"` |
| General shader concepts, GPU architecture | `mcp__exa__web_search_exa` | Semantic query |

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: guardrails, TD-specific patterns, uniform workflow, code organization, templates
- **Fetch fresh docs** for: specific TD function signatures not listed here, advanced GLSL features, new TD version changes, unfamiliar shader algorithms

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
