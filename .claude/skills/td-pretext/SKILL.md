# TD-Pretext — Native Text Layout with Obstacle Avoidance in TouchDesigner

> **Cache rule**: If you already loaded this skill or read a reference file in the current conversation, do NOT re-read it. Use your memory of the content.

## When to Use

Use this skill when the user needs:
- Text flowing around obstacles (circles, bitmap silhouettes, arbitrary shapes)
- Character-level text layout at 60fps in TouchDesigner
- Font atlas generation and GPU-instanced text rendering
- Porting Pretext.js patterns to pure TD (no Web Render TOP)
- Text measurement without a browser (evalTextSize, PIL)

## Architecture Overview

```
text_source → [atlas_generator] → atlas_top (texture) + glyph_metrics (table)
                                         ↓
panel1/null_mask → [layout_engine] → glyph_data (CHOP) → render_geo (instancing)
                                                              ↓
                                    atlas_top → text_glsl (MAT) → render_text (TOP)
```

Three decoupled phases:
1. **Atlas** (on text/font change): render unique chars → pack into texture + metrics table
2. **Layout** (every frame): greedy char-level line breaking with obstacle avoidance
3. **Render** (GPU): instanced quads sampling the atlas via GLSL MAT

## Critical Patterns

### 1. Character-Level Atlas (2D Texture Array)

Word-level atlas can't break mid-word → visible gaps around obstacles. Character-level atlas gives Pretext-equivalent flow quality. Each glyph = one slice in a 2D Texture Array.

```python
# Render each unique char with textTOP at RENDER_SCALE
helper.par.font = font_family
helper.par.fontsizex = font_size * RENDER_SCALE  # 3x for sharp text
sz = helper.evalTextSize(char)  # measure at render scale
# Store display-size in metrics (divide by RENDER_SCALE)
```

**RENDER_SCALE = 3** gives sharp text. 2x is noticeably blurry.

**Charset preloading:** `Atlascharset` menu parameter (dynamic/ascii/latin/unicode) pre-renders all chars at startup. In preloaded modes, text changes only update word widths (~0.2ms) — no atlas rebuild.

### 2. Greedy Line Breaking with Obstacle Segments

Port of Pretext's `layoutNextLine` algorithm:
- For each Y line: compute available segments (subtract obstacles)
- For each segment: accumulate chars until width exceeded
- Prefer breaking at spaces; break mid-word if segment is narrow
- Use numpy `cumsum` on pre-computed char width array for fast breaking

### 3. Bitmap Obstacle Spans

Extract silhouette from a mask TOP (e.g., webcam + NVIDIA Background removal):
- Read `numpyArray()`, scan alpha > threshold
- Use `np.diff` on boolean mask to find run starts/ends (fast)
- Cache spans with hash of alpha sum (avoid recomputing when mask unchanged)
- Apply margin dilation for cleaner text flow

### 4. Script CHOP Anti-Patterns

- **NEVER `cook(force=True)` from an Execute DAT `onFrameEnd`** — causes infinite cook loops and crashes TD
- **NEVER use `chan.numpyArray()[:] = data`** for bulk write — unreliable, produces invisible output
- Use per-sample `chan[i] = value` write (reliable, ~1ms for 1200 samples)
- Use storage (`comp.store`/`comp.fetch`) to pass data between Execute DAT and Script CHOP

### 5. Camera Orthographic Setup

```python
cam.par.projection = 'ortho'  # NOT 'orthographic' — TD uses 'ortho'
cam.par.orthowidth = 1920     # match render resolution
cam.par.tx = 960              # center at half-width
cam.par.ty = -540             # center at half-height (Y-flip)
cam.par.tz = 10
```

### 6. Atlas Rebuild Strategy

Two watchers with different responsibilities:

- **`text_watcher` (datexecuteDAT)**: watches `text_source`. In `dynamic` mode → full atlas rebuild. In preloaded modes (`ascii`/`latin`/`unicode`) → only update word widths (fast path, ~0.2ms).
- **`charset_watcher` (parexecDAT)**: watches `Atlascharset` parameter → always triggers full atlas rebuild.

```python
# text_watcher — fast path for preloaded modes
def _rebuild():
    mode = str(comp.par.Atlascharset)
    if mode == 'dynamic':
        atlas_top.cook(force=True)  # full rebuild
    else:
        _update_word_widths(comp)   # ~0.2ms, skip glyph rendering
    layout_engine.module._metrics_ready = False
```

Also detect changes in the layout engine via text hash comparison (belt + suspenders).

## Performance Budget (1920x1080, ~500 chars)

| Component | Cost | Method |
|-----------|------|--------|
| bitmap_spans | 0.03ms | numpy + hash cache |
| layout_engine | 2.7ms | cumsum + pre-alloc |
| glyph_script | 1.2ms | per-sample CHOP write |
| GPU render | <0.5ms | single instanced draw call |
| **Total** | **~4.5ms** | **well within 16.6ms/frame** |

## Comparison with Pretext.js (Web Render TOP)

| Aspect | Pretext.js | TD Native |
|--------|-----------|-----------|
| Latency | ~22 frames (Chromium pipeline) | 0 frames (synchronous) |
| Layout granularity | Grapheme segments | Character-level |
| Text measurement | Canvas measureText (sub-pixel) | evalTextSize (integer) |
| Rendering | Canvas fillText | GPU instanced quads |
| Unicode support | Full (CJK, bidi, Thai) | Latin only (sufficient for this project) |
| Obstacle types | Circle + bitmap | Circle + bitmap (identical math) |

## Loading References

| Your task | Load |
|---|---|
| Atlas generation patterns, metrics table format | @references/atlas.md |
| Layout algorithm, obstacle math, performance tips | @references/layout.md |
| GLSL MAT shaders for instanced text rendering | @references/rendering.md |
