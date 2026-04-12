<!-- session_id: 54fc9980-16ad-4238-b538-a39e8217201e -->
# TDPretextPop — Text Layout with Obstacle Avoidance via POP System

## Context

TDPretextNative uses a 3-phase pipeline: atlas generation (2D Texture Array) → Python layout engine → instanced quads via GLSL MAT. This works but has complexity (atlas management, Script CHOP bottleneck, GLSL shaders).

TD 2025.32460 introduces **textPOP** — a native operator that generates triangulated vector mesh from text. In `specdat` mode, each row of a table DAT controls one character (text, position, size, color, font). This eliminates the atlas entirely.

**Goal:** Build `TDPretextPop`, a new COMP replicating all TDPretextNative features using textPOP instead of atlas+instancing.

## Architecture

```
text_source DAT ──┐
                   ├──→ [layout_engine.py] ──→ spec_dat (tableDAT)
null_mask TOP ─────┘                              │
                                              textPOP (mode=specdat)
                                                  │
                                              nullPOP
                                                  │
                                              poptoSOP
                                                  │
                                          Geometry COMP + constantMAT
                                                  │
                                       cameraCOMP (ortho) + renderTOP
```

### What changes vs TDPretextNative

| Aspect | Native (old) | Pop (new) |
|--------|-------------|-----------|
| Font rendering | 2D Texture Array atlas at 3x | textPOP vector mesh (resolution-independent) |
| Per-char data | Script CHOP (13 channels × N samples) | tableDAT (spec_dat, ~10 columns × N rows) |
| Shader | Custom GLSL MAT (vertex + frag) | constantMAT (or phongMAT) — no custom shader |
| Charset preloading | Required (dynamic/ascii/latin/unicode) | **Not needed** — textPOP accepts any char |
| Instance pipeline | glyph_data CHOP → instance_data_top → geo instancing | textPOP generates all geometry directly |
| 3D potential | 2D only (ortho quads) | 3D capable (extrude, perspective) |

### What stays identical
- Layout algorithm (greedy line-breaking, numpy cumsum + searchsorted)
- Circle obstacle math
- Bitmap obstacle span detection (numpy diff, hash caching)
- Repeat text mode
- Auto lineheight mode
- Webcam/mask pipeline (videodevin → nvbackground → thresh → null_mask)

## Coordinate System

textPOP `fontsizex` is in **world units**. The ortho camera's `orthowidth` maps world→screen.

Strategy: **1 world unit = 1 pixel** (orthowidth = render width).

- Layout engine outputs pixel positions → write directly to spec_dat tx/ty
- `fontsizex/y` = font_size_pixels / some_calibration_factor (need to measure)
- Camera: orthowidth=1920, tx=960, ty=-540, tz=10 (same as Native)

Need to calibrate: create textPOP with known fontsizex, measure output bounds, derive pixel-to-world ratio.

## Step-by-Step Implementation

### Step 1: Create TDPretextPop base COMP
- Create new `baseCOMP` at `/TDPretextPop` in TDpretext.toe
- Add custom parameters:
  - **Text page**: `Textsource` (DAT ref), `Repeattext` (toggle), `Autolineheight` (toggle), `Lineheight` (float)
  - **Font page**: `Font` (menu), `Fontsize` (float), `Fontcolor` (RGBA)
  - **Obstacle page**: `Obstaclemode` (menu: none/circle/bitmap), `Masktop` (TOP ref), `Bitmapmargin` (int), `Pointerradius` (float)
  - **Render page**: `Renderwidth` (int, 1920), `Renderheight` (int, 1080)

### Step 2: Build the spec_dat output
- Create `text_source` (textDAT) — input text
- Create `spec_dat` (tableDAT) — layout engine writes here
- Columns: `text | tx | ty | fontsizex | fontsizey | fontcolorr | fontcolorg | fontcolorb | fontalpha`

### Step 3: Calibrate textPOP coordinate system
- Create textPOP with known fontsizex, measure bounds via poptoDAT
- Determine the ratio: `pixels = fontsizex * K` where K is the calibration constant
- This ratio defines how layout engine converts pixel positions to textPOP world coords

### Step 4: Port layout engine
- Copy layout_engine from TDPretextNative
- Change output: instead of `comp.store('_layout_instances', [...])`, write rows to spec_dat
- Key adaptation: `spec_dat.clear(); spec_dat.appendRow(headers); for char in layout: spec_dat.appendRow([...])`
- Keep all obstacle logic (circle + bitmap) unchanged
- Keep repeat text and auto lineheight unchanged

### Step 5: Wire textPOP pipeline
- `textPOP` (mode=specdat, specdat=spec_dat)
- `nullPOP` (pass-through, inspection point)
- `poptoSOP` (par.pop = nullPOP)
- `geometryCOMP` with poptoSOP inside, constantMAT
- `cameraCOMP` (projection=ortho, orthowidth=1920, positioned center)
- `renderTOP` (geometry=geometryCOMP, camera=cameraCOMP, resolution=1920x1080)

### Step 6: Webcam/obstacle pipeline
- `videodevinTOP` → `nvbackgroundTOP` → `threshTOP` → `null_mask`
- Layout engine reads `null_mask.numpyArray()` for bitmap spans (same as Native)

### Step 7: Wire watchers
- `text_watcher` (datexecDAT on text_source): triggers layout recompute
- `par_watcher` (parexecDAT): watches font/obstacle params, triggers recompute

### Step 8: Verify and tune
- Compare visual output with TDPretextNative side-by-side
- Measure performance (expect improvement: no atlas rebuild, no Script CHOP write)
- Test all obstacle modes (none, circle, bitmap)
- Test repeat text, auto lineheight

## Performance Expectations

| Component | Native (ms) | Pop (expected ms) | Why |
|-----------|------------|-------------------|-----|
| Atlas rebuild | ~1-2ms | **0** | No atlas |
| Layout engine | ~2.7ms | ~2.7ms | Same algorithm |
| Script CHOP write | ~1.25ms | **0** | No CHOP |
| spec_dat write | 0 | ~0.5ms | tableDAT appendRow |
| textPOP cook | 0 | ~1-2ms | Mesh generation |
| Render | ~1.2ms | ~1ms | Similar |
| **Total** | ~6-7ms | ~4-5ms | Slight improvement |

Main win: simpler pipeline, fewer operators, no atlas VRAM, resolution-independent text.

## Key Files
- `TDpretext/TDpretext.toe` — project file (binary, built via MCP)
- `.claude/skills/td-pretext/` — skill docs to update after

## Verification
1. Visual: side-by-side with TDPretextNative, text should flow identically around obstacles
2. Performance: `get_performance` on both comps, compare cook times
3. Repeat text: fill screen, no gaps, no infinite loop
4. Bitmap obstacles: webcam silhouette creates real-time text displacement
5. Font change: switch font/size, text re-layouts correctly
