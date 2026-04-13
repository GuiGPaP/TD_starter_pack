---
name: td-glsl
description: "Write GLSL shaders for TouchDesigner — pixel/fragment (GLSL TOP), vertex (GLSL MAT), and compute/particle (GLSL POP family). Use this skill for any shader work in TD: pixel shaders, post-processing, image filters, generative textures, feedback shaders, vertex displacement, 3D materials, mesh deformation, instancing, GPU particle systems, point cloud manipulation, compute shaders, GLSL TOP compilation errors, or shader performance optimization. Trigger on mentions of GLSL TOP, GLSL MAT, GLSL POP, pixel shader, vertex shader, compute shader, fragment shader, particle shader, point operator, SSBO, or any request to write GLSL code in TouchDesigner."
---

# TouchDesigner GLSL Shaders

> **Cache rule**: If you already loaded this skill or read a reference file in the current conversation, do NOT re-read it. Use your memory of the content.

> **Post-write rule**: After ANY `set_dat_text` on a GLSL DAT, call `validate_glsl_dat` immediately. Fix and re-write if validation fails. Never consider shader code done without validation. Skip validation for data DATs (JSON, CSV, plain text).

> **Execution mode rule**: Default to `read-only` mode for `execute_python_script` when inspecting shaders or uniforms. Only escalate to `safe-write` when creating operators.

## Domain Router

Pick the ONE domain that matches your task, then load its domain file:

| Task | Domain | Load |
|---|---|---|
| Pixel shader, GLSL TOP, 2D image effects, post-processing, generative textures, feedback, chromatic aberration | **Pixel** | @domains/pixel.md |
| Vertex shader, GLSL MAT, 3D materials, vertex displacement, mesh deformation, instancing, surface normals | **Vertex** | @domains/vertex.md |
| Compute shader, GLSL POP, GPU particles, point cloud, SSBO, GLSL Advanced POP, GLSL Copy POP | **Compute** | @domains/compute.md |

**After loading the domain file**, follow its Reference Docs table to load ONE reference or example as needed.

## Shared Guardrails

1. **Project context first.** Before writing TD code, check if `td_project_context.md` exists at repo root and read it. If not, run `index_td_project` first (see td-guide skill).

2. **No `#version` directive.** TouchDesigner injects its own. Adding one causes `#version must occur before any other statement`.

3. **Never declare auto-injected variables.** Each domain has different injected variables — check the domain file for the list.

4. **`validate_glsl_dat` after every `set_dat_text`.** Always validate. Fix and re-write if validation fails.

5. **Guard `normalize()` against zero-length vectors.** `normalize(vec2(0.0))` is undefined behavior (NaN). Check `length() > 0.0` first.

6. **Guard division by zero.** Clamp distances with `max(dist, EPSILON)` — zero-distance singularities produce NaN.

## Shared TD Built-in GLSL Functions

```glsl
// Noise
float TDPerlinNoise(vec2/vec3/vec4 v);  // [-1, 1]
float TDSimplexNoise(vec2/vec3/vec4 v); // [-1, 1]

// Color
vec3 TDHSVToRGB(vec3 c);  vec3 TDRGBToHSV(vec3 c);
vec4 TDDither(vec4 color);              // anti-banding noise

// Matrix transforms
mat4 TDTranslate(float x, float y, float z);
mat3 TDRotateX(float radians);
mat3 TDRotateY(float radians);
mat3 TDRotateZ(float radians);
mat3 TDRotateOnAxis(float radians, vec3 axis); // axis must be normalized
mat3 TDScale(float x, float y, float z);
mat3 TDRotateToVector(vec3 forward, vec3 up);
```

## Fetching Documentation

| Question domain | Tool to use | How |
|---|---|---|
| GLSL patterns in our knowledge base | `search_glsl_patterns` | query + type/difficulty/tags |
| Official shader examples from Derivative | `search_snippets` | query + `family="TOP"` or `family="MAT"` |
| Full snippet with embedded GLSL code | `get_snippet` | snippet ID (e.g. `"glsl-top"`) |
| Operator params, examples | `search_operators` | query "glsl" or "noise" etc. |
| TD techniques (audio-reactive, feedback, etc.) | `search_techniques` | query + category |
| TD version features, breaking changes | `get_version_info` / `list_versions` | version ID |
| GLSL language spec, advanced features | `mcp__plugin_exa-mcp-server_exa__get_code_context_exa` | `"GLSL [function] specification"` |
| Shader algorithms, visual effects | `mcp__plugin_exa-mcp-server_exa__get_code_context_exa` | `"GLSL [effect name] shader tutorial"` |

**`search_glsl_patterns` vs `search_snippets`:** `search_glsl_patterns` is curated and difficulty-ranked — use it first for known shader patterns. `search_snippets` with `family="TOP"` or `family="MAT"` returns Derivative's official .tox examples with embedded GLSL code, readMe explanations, and full network context — use it when you need real-world shader usage patterns or connection examples.

### When to trust this skill vs. fetch fresh docs

- **Trust the skill** for: guardrails, built-in reference, TD-specific patterns, uniform workflow, templates
- **Fetch fresh docs** for: specific function signatures not listed, advanced GLSL features, new TD version changes, unfamiliar shader algorithms

## Loading Sequence

1. Load this SKILL.md (you're reading it now)
2. Load the ONE domain file that matches your task (@domains/pixel.md, vertex.md, or compute.md)
3. From the domain file's Reference Docs table, load ONE reference or example as needed
4. If you discover mid-task you need a second reference, load it then
