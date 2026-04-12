<!-- session_id: 8f13e36d-2334-4fc7-b795-aa1b11a2b2e0 -->
# Plan: Fix TDPretextPop UV mapping + blending + preset tests + profiling

## Context

TDPretextPop renders text via GLSL Copy POP → GLSL MAT pipeline. Layout and obstacle avoidance work, but glyphs appear as dark grey rectangles because UVs are broken. The vertex shader guesses UV mapping via `gl_VertexID % 4` but the winding doesn't match the Rectangle POP vertex order, and the GLSL Copy POP doesn't pass through Tex attributes (vertcomputemethod is `default`).

## Step 1: Fix GLSL Copy POP Tex passthrough

**Operator:** `/TDPretextPop/render_geo/glsl_copy`

Current warning: "Vertex Attribute can only be created when using a custom vertex shader, skipping"

Changes:
- Set `vertcomputemethod` from `default` → `custom`
- Set `vertoutputattrs` to `Tex`
- The vertCompute DAT already has the right code: `Tex[id] = TDIn_Tex();`

This enables the Rectangle POP's UV coordinates to flow through the Copy POP to the GLSL MAT.

## Step 2: Fix GLSL MAT vertex shader

**DAT:** `/TDPretextPop/text_glsl_vertex`

Replace the broken `gl_VertexID % 4` UV computation with actual geometry UVs:

```glsl
// TDPretextPop vertex shader — POP direct render
out vec2 vTexCoord;
flat out vec3 vGlyphData;
out vec4 vColor;

void main() {
    gl_Position = TDWorldToProj(TDDeform(P));
    vTexCoord = uv[0].st;   // Use actual UVs from geometry
    vGlyphData = N;
    vColor = Cd;
}
```

## Step 3: Fix blending / color premult

**Operator:** `/TDPretextPop/text_glsl` (glslMAT)

Current: `pointcolorpremult: alreadypremult` — but vertex colors from spec_dat are NOT premultiplied.

Change: `pointcolorpremult` → `notpremult`

Also check if `postmultalpha: true` combined with the fragment shader output is correct. The fragment shader outputs:
```glsl
fragColor = TDOutputSwizzle(vec4(vColor.rgb, texel.a * vColor.a));
```
With premult pipeline, RGB should be multiplied by alpha too:
```glsl
float a = texel.a * vColor.a;
fragColor = TDOutputSwizzle(vec4(vColor.rgb * a, a));
```

## Step 4: Verify with screenshot

After each fix, screenshot `/TDPretextPop/render_text` to check:
- Glyphs are readable (not grey rectangles)
- Colors are correct brightness (not darkened)
- Alpha blending is clean (no dark halos)

## Step 5: Test all presets

Switch preset parameter and verify each:
- `none` — plain text flow
- `displaced` — text with bitmap obstacle avoidance
- `textface` — text inside silhouette
- `ascii` — ASCII art from video

## Step 6: Final profiling

Use `get_performance` to capture baseline metrics per preset.

## Verification

1. Screenshot after UV fix → glyphs should be visible text characters
2. Screenshot after blending fix → correct brightness, no halos
3. Each preset screenshot → expected visual output
4. Performance report → FPS ≥ 25 for all presets at 18K chars
