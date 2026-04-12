# POP Node Workflow — Text Instancing with UVW Mapping

Node-based POP patterns for text particle systems. No GLSL compute shaders needed — uses standard POP operators with Geometry COMP instancing.

## Core Concept: UVW Character Lookup

Each character is a depth slice in a **Texture 3D TOP**. Each particle's `W` attribute selects which character to display.

### 3D Texture Atlas

```
textTOP (displays chr(frame)) → texture3DTOP (cache=256, prefill)
```

- Text TOP expression: `chr(int(me.time.frame - 1) % 256)`
- Cache size: **256** (full 8-bit ASCII)
- Hit **Prefill** to capture all 256 characters
- Use **2D Texture Array** mode for integer W (no interpolation between chars)
- 3D Texture mode interpolates between slices (crossfade effect)

### Assigning W per Particle

**scriptPOP callback** to convert text → ASCII codes:

```python
# In script POP callback (onCook):
for c in scriptOp.inputs[0].text:
    scriptOp.appendRow([ord(c)])
```

Then `datToChop` (single channel, first column is values) → `nullCHOP` ("null_W")

**lookupChannelPOP:**
- CHOP: `null_W`
- Lookup attribute: `_pointi` (point index)
- Lookup index unit: **Sample Index** (not normalized)
- Output attribute: `W` (or any custom name like `memosW`)
- Extend right: **Cycle** (for text repeat)

## POP Network Patterns

### Line Scroller

```
linePOP → lookupChanPOP(W) → mathCombine(wave) → lookupChanPOP(Y offset)
              ↑                                         ↑
         null_W (CHOP)                            patternCHOP (sine)
```

**Line divisions** = `op('info1')['length'] - 1` (points = divisions + 1)

**Spacing:** Line endpoint X = `me.par.divs * spacing_constant`

**Scrolling:**
```
lfoCHOP (ramp) → mathCHOP (range: [buffer, -(text_length + buffer)])
                     ↓
               transformPOP.par.tx
```
Frequency = `scroll_speed / text_length` (speed independent of text length)

### Grid Text Block

```
gridPOP → lookupChanPOP(W) → [animation chain] → null_points
```

**Parametric grid sizing from text length:**
```python
num_chars = len(text)
cols = ceil(sqrt(num_chars) * sqrt(aspect_ratio))
rows = ceil(num_chars / cols)
# Grid size:
h_size = cols * h_spacing
v_size = rows * v_spacing
```

- Use `ceil` (not `round`) for rows to guarantee all text fits
- Repeat text: set lookupChanPOP extend right to **Cycle**
- Flip vertically (transformPOP scale Y = -1) to start text at top

### Shape Mixing (Grid ↔ Sphere)

Mix between two geometries using `mathMixPOP` with two inputs:

```
gridPOP ─────────┐
                  ├→ mathMixPOP (mix P↔P2, N↔N2 by shape_mix)
pointGenPOP ─────┘
```

**Setup:**
1. Input A (grid): takes all attributes including P, N
2. Input B (sphere): take P → rename to `P2`, take N → rename to `N2`
3. Mix: P to P2 → write P, N to N2 → write N, factor = `shape_mix` uniform
4. pointGenPOP.par.numpoints = `op('grid').numPoints`

**Critical performance pattern — use uniforms not attributes for mix factor:**
```
attributePOP → create "shape_mix" as UNIFORM (not per-point attribute)
mathMixPOP → reference shape_mix uniform
```
Per-point attribute for a constant value is much slower than a uniform.

### Smooth Oscillation (LFO + S-Curve)

```
lfoCHOP (ramp, amplitude=0.5, offset=0.5) → scurveCHOP → null
```

S-curve controls:
- **prepend/append**: hold time at 0 and 1 (dwell)
- **bias**: asymmetric time (more time at grid vs sphere)
- Output: smooth 0→1→0 with configurable timing

## Field-Based Interaction (Attractor/Repeller)

`fieldPOP` creates a `weight` attribute (0-1) based on distance to a shape:

```
[pop chain] → fieldPOP (sphere) → mathCombine (apply weight effects) → null
                 ↑
            position/scale from mouse CHOP
```

**Field parameters:**
- `attractor`: sphere, box, plane, etc.
- `radius` ← from CHOP (e.g., mouse speed → scale)
- `transitionrange`: 1.0+ for soft falloff (0 = hard cutoff)
- `transitiontype`: `smoothstep` for smooth edges

**Applying weight to effects:**
```
# Scale: point_scale = base_scale + weight * extra_scale
mathCombine: A + B * C → pscale = pscale + weight * 5.0

# Character randomization: W = W + weight * noise_W
mathCombine: A + B * C → memosW = memosW + weight * noise_W

# Position displacement: P.z = P.z + weight * push_amount
mathCombine: A + B * C → P.z = P.z + weight * 5.0
```

### Mouse Speed → Attractor Size

```
mouseCHOP → springCHOP (damp) → slopeCHOP → mathCHOP (length)
                                                 ↓
                                           speed (scalar)
                                                 ↓
                                      limitCHOP (clamp min/max)
                                                 ↓
                                      fieldPOP.par.radius
```

## Attribute System

### Built-in Attributes

| Name | Type | Description |
|------|------|-------------|
| `P` | vec3 | Position |
| `N` | vec3 | Normal |
| `Cd` | vec4 | Color |
| `pscale` | float | Point scale (instancing convention) |
| `text` | vec3 | Texture coordinates UVW (POP default name) |

### Hidden Attributes (mathPOP only)

| Name | Description |
|------|-------------|
| `_pointi` | Point index (integer) |
| `_pointu` | Normalized point index (0-1) |

**Gotcha:** `_pointi`/`_pointu` only available in `mathCombinePOP`/`mathMixPOP`, **not** in `noisePOP` or `fieldPOP`. To use elsewhere, first copy to a named attribute:
```
mathCombinePOP → "just A" → read _pointu → write to "id_norm"
noisePOP → lookup attribute: id_norm
```

### Custom Attributes

- `attributePOP` — constant value for all points
- `randomPOP` — random values (uniform, gaussian)
- Names are arbitrary (e.g., `memo`, `wave_lookup`, `noise_w`)
- Can be float, int, vec2, vec3, vec4

## Noise Patterns

### Key Insight: Lookup vs Output are Independent

- **Lookup attribute**: what coordinate indexes into the noise field
- **Output**: what attribute the noise writes to

```
noisePOP:
  lookup = P        → noise varies with world position (changes as particle moves)
  lookup = id_norm  → noise is fixed per particle index (stable)
  output = add to P     → displaces position
  output = set pscale   → varies scale
  output = add to Cd    → varies color
  output = create "noise_w" → store for later weighted application
```

Use `id_norm` (not `P`) when you don't want noise to change as particles move through space.

### Deferred Application (weight-gated noise)

1. `noisePOP` → output: **none** (create custom attribute `noise_w`)
2. `mathCombinePOP` → `W = W + weight * noise_w` (only applies inside field)

This pattern separates noise generation from application, allowing field-gated effects.

### Noise Types

- **Standard** (Perlin): default, good for general variation
- **Curl**: divergence-free, organic flow (best for position displacement)

## Instancing Setup (Geometry COMP)

```python
geo.par.instancing = True
geo.par.instanceop = 'null_points'
# Instance 1 page:
geo.par.instancetx = 'P0'
geo.par.instancety = 'P1'
geo.par.instancetz = 'P2'
geo.par.instancesx = 'pscale'
# Instance 2 page:
geo.par.instancetexture = 'textW'   # W → 3D texture depth
geo.par.instancecolorr = 'Cd0'
geo.par.instancecolorg = 'Cd1'
geo.par.instancecolorb = 'Cd2'
# Rotate to face normal:
geo.par.instancerotatevec = 'N'
geo.par.instanceforwarddir = '+z'  # or '-z', flip if backwards
```

## Material for Text Particles

```python
phongMAT.par.colormap = texture3d_top
phongMAT.par.blending = True       # Required for text alpha
phongMAT.par.depthtest = True
phongMAT.par.depthwriting = False  # Fixes alpha sorting artifacts
```

**Without `depthwriting = False`**: opaque-looking edges where text quads overlap (depth buffer prevents rendering behind already-drawn transparent pixels).

## Wave Lookup Pattern (Parametric Frequency)

To apply a sine wave with controllable frequency independent of point count:

1. Create `wave_freq` constant CHOP
2. `mathCombinePOP`: `wave_lookup = _pointi * wave_freq` (A * B)
3. `lookupChannelPOP`: lookup attribute = `wave_lookup`, extend = **Cycle**
4. Pattern CHOP (sine) → lookupChannelPOP writes to P.y

This decouples wave frequency from the number of points.

## GLSL Copy POP — Zero poptoSOP Alternative (Validated 2026-04-08)

For high char counts (1000+), GLSL Copy POP stamps a quad per character entirely on GPU. No poptoSOP needed.

**Architecture:**
```
dattoPOP (P, Color, N, pscale) → POP Buffers on GLSL Copy POP
rectanglePOP (1×1 quad)        → input 0 (template)
                                    ↓
                               GLSL Copy POP
                                    ↓
                               nullPOP (render=True)
                                    ↓
                               GLSL MAT + atlas texture2DArray
```

**dattoPOP attribute packing** (built-in attrs only — custom attrs not readable via TDIn_):
- `P` = (tx, ty, fontsize) — position + size packed in z
- `Color` = (r, g, b, a) — font color
- `N` = (glyph_w_norm, glyph_h_norm, atlas_W) — atlas metadata
- `pscale` = charwidth

**POP Buffers** (on GLSL Copy POP, 4 buffers):
```
buffer0: pop=dattoPOP, attr=P,      name=instP
buffer1: pop=dattoPOP, attr=Color,  name=instColor
buffer2: pop=dattoPOP, attr=N,      name=instN
buffer3: pop=dattoPOP, attr=pscale, name=instCW
```

**Point compute shader:**
```glsl
void main() {
    const uint id = TDIndex();
    if (id >= TDNumPoints()) return;
    vec3 quadP = TDIn_P();  // template quad vertex
    uint ci = TDCopyIndex();
    vec3 iP = TDBuffer_instP(ci);
    vec4 iColor = TDBuffer_instColor(ci);
    vec3 iN = TDBuffer_instN(ci);
    float cw = TDBuffer_instCW(ci);
    vec3 pos;
    pos.x = quadP.x * cw + iP.x;
    pos.y = quadP.y * iP.z + iP.y;  // iP.z = fontsize
    pos.z = 0.0;
    P[id] = pos;
    Color[id] = iColor;
    N[id] = iN;
    TDUpdatePointGroups();
}
```
Output Attributes: `P Color N` (create `Color` via Create Attributes page, menu value `color`).

**GLSL MAT vertex shader** (UV from vertex ID since Tex isn't propagated):
```glsl
out vec2 vTexCoord;
flat out vec3 vGlyphData;
out vec4 vColor;
void main() {
    gl_Position = TDWorldToProj(TDDeform(P));
    int corner = gl_VertexID % 4;
    vTexCoord = vec2(
        (corner == 1 || corner == 2) ? 1.0 : 0.0,
        (corner >= 2) ? 1.0 : 0.0
    );
    vGlyphData = N;
    vColor = Cd;
}
```

**Performance comparison (fontsize=10, 18K chars):**
| Approach | FPS | Bottleneck |
|----------|-----|-----------|
| poptoSOP + instancing | 10 | CPU (1039ms/cook) |
| textPOP vector mesh | 4 | GPU (800K triangles) |
| **GLSL Copy POP + atlas** | **25** | **GPU (36K triangles)** |

## Performance Tips

| Pattern | Why |
|---------|-----|
| Uniform for constants (not per-point attribute) | GPU processes one value instead of per-element buffer |
| Disable `pop2` table viewer with large point counts | Prevents massive UI slowdown |
| `depthwriting = False` on material | Avoids full alpha sort |
| Merge multiple POP outputs → single geo | One draw call |
| Curl noise over standard Perlin | More organic, fewer harmonics needed |
| `id_norm` lookup for stable noise | Prevents per-frame recomputation as particles move |
