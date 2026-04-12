<!-- session_id: 54fc9980-16ad-4238-b538-a39e8217201e -->
# TDPretextPop — Phase 2: GPU Bitmap Obstacles + Native-style Menus

## Context

TDPretextPop base component is working (textPOP specdat → nullPOP render=True → Render TOP). Circle obstacles and repeat text work. Two issues remain:

1. **Bitmap obstacle mode runs at 2 FPS** — `frame_exec` forces Python re-layout every frame (`hash((h, frame))`), and `_read_bitmap_spans` does GPU→CPU `numpyArray()` readback each frame
2. **Missing TDPretextNative-style menus** — needs `Preset` (displaced/textface/ascii), `Fontfamily` (StrMenu with all system fonts), `Padding`, `Minsegwidth`, `Atlascharset`

## Current State (after crash recovery)

```
/TDPretextPop (baseCOMP)
├── text_source (textDAT)
├── spec_dat (tableDAT) 
├── layout_engine (textDAT) — Python module with compute_layout()
├── frame_exec (executeDAT) — hash-based change detection, calls layout
├── render_geo (geometryCOMP)
│   ├── text_pop (textPOP, mode=specdat)
│   └── null_pop (nullPOP, render=True)
├── text_mat (constantMAT)
├── text_camera (cameraCOMP, ortho)
├── render_text (renderTOP)
└── null_out (nullTOP)
```

`obstacle_glsl` was lost in the crash — needs to be recreated safely.

## Fix 1: GPU Bitmap Obstacles via GLSL POP

**Strategy**: Text layout stays fixed (Python, no obstacles). A GLSL POP samples the mask TOP each frame on GPU and sets `Color.a = 0` for vertices inside obstacles. Zero CPU cost per frame.

### Steps

1. **Create GLSL POP** inside render_geo, **disconnected** (no input yet)
2. **Write compute shader** to the docked `_compute` DAT:
   ```glsl
   uniform sampler2D uObstacleMask;
   uniform vec2 uCanvasSize;
   uniform float uMaskThreshold;
   void main() {
       uint id = TDIndex();
       if (id >= TDNumElements()) return;
       vec3 pos = TDIn_P();
       vec4 col = TDIn_Color();
       vec2 uv = pos.xy / uCanvasSize;
       uv.y = 1.0 - uv.y;
       float m = texture(uObstacleMask, uv).r;
       col.a *= (1.0 - step(uMaskThreshold, m));
       P[id] = pos;
       Color[id] = col;
   }
   ```
3. **Configure GLSL POP params** (in separate MCP call, no cook):
   - `outputattrs = 'P Color'`
   - `initoutputattrs = False`  
   - Sampler 0: `uObstacleMask` → linked to `comp.par.Masktop` via expression
   - Vector 0: `uCanvasSize` (vec2) = 1920, 1080
   - Vector 1: `uMaskThreshold` (float) = 0.25
4. **Wait 1 frame** (let shader compile)
5. **Connect**: null_pop → obstacle_glsl, set obstacle_glsl render=True, null_pop render=False
6. **Fix frame_exec**: remove `hash((h, frame))` for bitmap mode — layout is no longer recomputed per frame for bitmap obstacles
7. **Fix constantMAT**: ensure `applypointcolor = True` so vertex Color alpha is respected
8. **Enable alpha blending** on Render TOP if needed

### Key safety rule
**NEVER** `cook(force=True)` on a GLSL POP in the same script that writes its shader. Always separate into distinct MCP calls.

## Fix 2: TDPretextNative-style Menus

TDPretextNative has these params (from live introspection):

**Config page:**
- `Preset` (Menu): displaced / textface / ascii
- `Fontfamily` (StrMenu): all system fonts
- `Fontsize` (Float)
- `Lineheight` (Float)  
- `Padding` (Float)
- `Minsegwidth` (Float)
- `Autolineheight` (Toggle)
- `Repeattext` (Toggle)

**Atlas page:**
- `Atlascharset` (Menu): dynamic / ascii / latin / unicode

### Mapping to TDPretextPop

| TDPretextNative param | TDPretextPop action |
|---|---|
| `Preset` (displaced/textface/ascii) | Add menu. `displaced` = bitmap obstacle mode, `textface` = circle mode, `ascii` = skip (TDPretextNative-specific) |
| `Fontfamily` (StrMenu) | Replace current `Font` menu with StrMenu populated from `textPOP.par.font.menuNames` |
| `Padding` | Add Float param, wire to layout_engine |
| `Minsegwidth` | Add Float param, wire to layout_engine |
| `Atlascharset` | Not relevant for POP (no atlas), skip or add as no-op |

### Steps

1. Remove existing `Font` menu from Font page
2. Add `Fontfamily` (StrMenu) populated from textPOP font list
3. Add `Preset` menu to Config page: `displaced` / `textface` / `none`
4. Add `Padding` (Float, default 0) and `Minsegwidth` (Float, default 40)
5. Update layout_engine to use `Padding` and `Minsegwidth` params
6. Update frame_exec hash to include new params

## Execution Order

1. Fix GLSL POP (steps 1-2: create + write shader, NO connection)
2. Configure GLSL POP params (step 3, separate call)
3. Wait/verify shader compiled (step 4)
4. Wire GLSL POP (step 5, separate call) 
5. Fix frame_exec (step 6)
6. Add menus (Fix 2 steps)
7. Test bitmap mode FPS
8. Screenshot verification
9. Save project

## Verification

1. **Bitmap mode FPS**: should be 30+ FPS (was 2 FPS)
2. **Circle obstacle**: still works with text reflow
3. **Bitmap obstacle**: characters hidden behind mask (not reflowed, but 60fps)
4. **Preset menu**: displaced/textface options work
5. **Font change**: Fontfamily StrMenu works
6. **Performance**: `cookTime` on obstacle_glsl < 1ms
