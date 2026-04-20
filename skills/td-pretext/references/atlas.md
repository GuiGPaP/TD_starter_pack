# Font Atlas Generation

## Character-Level Atlas (2D Texture Array)

Each unique character is rendered into its own **slice** of a 2D Texture Array. One glyph = one slice, all slices share the same power-of-2 dimensions.

### Why Character-Level

- Word-level atlas can't break mid-word -> gaps around narrow obstacle segments
- ~80 unique chars vs ~200 words -> smaller atlas, faster rebuild
- Pretext.js works at grapheme/segment level, not word level

### Why 2D Texture Array (not shelf-packed 2D)

- No UV packing complexity — each slice is its own coordinate space
- `texelFetch(sampler2DArray, ivec3(x, y, slice), 0)` in shader
- Glyph-to-slice mapping is a simple integer index
- Easier to extend (add/remove chars without repacking)

### Atlas Pipeline

```
text_source + Atlascharset → extract unique chars → measure each (evalTextSize)
                                                         ↓
                                             render each (textTOP at RENDER_SCALE)
                                                         ↓
                                             one numpy slice per glyph (SLICE_W x SLICE_H)
                                                         ↓
                                             copyNumpyArray → Script TOP output (2D Array)
                                                         ↓
                                             write glyph_metrics table DAT
```

### Charset Preloading (`Atlascharset` parameter)

Custom menu parameter on `/TDPretextNative` COMP to preload character sets:

| Value | Label | Chars | Description |
|-------|-------|-------|-------------|
| `dynamic` | Dynamic (text only) | ~30-80 | Only chars present in text_source (default) |
| `ascii` | ASCII (32-126) | ~95 | Standard printable ASCII |
| `latin` | Latin Extended | ~200 | ASCII + accents (Latin-1 Supplement + Extended-A) + typographic punctuation |
| `unicode` | Unicode BMP Common | ~600+ | Latin + Greek + Cyrillic + math operators + arrows |

**Key behavior:** In preset modes, the atlas contains the **union** of preset chars + text chars — never misses a character.

**Fast path:** When `Atlascharset != 'dynamic'`, text changes only update word widths (~0.2ms) — the expensive glyph rendering is skipped because all chars are already in the atlas.

### Metrics Table Format

```
char | width_px | height_px | slice_index | glyph_w_norm | glyph_h_norm
 ' ' | 12.4     | 34.0      | -1          | 0            | 0
 T   | 20.7     | 15.5      | 0           | 0.625        | 0.484375
 h   | 18.3     | 15.5      | 1           | 0.5625       | 0.484375
```

- `width_px`, `height_px`: display-space size (atlas size / RENDER_SCALE)
- `slice_index`: integer index into the 2D Texture Array (-1 = space, not rendered)
- `glyph_w_norm`, `glyph_h_norm`: normalized glyph size within the slice (for UV)
- Space char (row 1): only width matters, no atlas entry (not rendered)

### RENDER_SCALE

Render glyphs at Nx resolution for sharp text:

| Scale | Quality | Slice size for font_size=34 |
|-------|---------|--------------------------|
| 1x | Blurry | ~32x64 |
| 2x | Acceptable | ~64x128 |
| **3x** | **Sharp (recommended)** | ~128x128 |
| 4x | Diminishing returns | ~128x256 |

### Space Width Measurement

```python
# Measure space by difference
sz_with = helper.evalTextSize('M M')
sz_without = helper.evalTextSize('MM')
space_width = (sz_with[0] - sz_without[0]) / RENDER_SCALE
```

### Slice Sizing

All slices share the same dimensions (smallest power-of-2 that fits the largest glyph):

```python
max_raw_w = max(g['raw_w'] for g in glyph_entries)
max_raw_h = max(g['raw_h'] for g in glyph_entries)
slice_w = _next_pow2(max_raw_w)
slice_h = _next_pow2(max_raw_h)
```

### textTOP Configuration for Atlas Rendering

```python
helper.par.alignx = 'center'   # center glyph in tile
helper.par.aligny = 'center'
helper.par.wordwrap = False
helper.par.outputresolution = 'custom'
helper.par.resmult = False
helper.par.bgalpha = 0.0       # transparent background
helper.par.fontcolorr = 1.0    # white text (color applied in shader)
```

### Triggering Atlas Rebuild

Two watchers:
- **`text_watcher` (datexecuteDAT)**: watches `text_source` — in `dynamic` mode triggers full rebuild, in preset modes only updates word widths (fast path)
- **`charset_watcher` (parexecDAT)**: watches `Atlascharset` parameter — always triggers full atlas rebuild

```python
# text_watcher fast path (preset modes)
def _rebuild():
    mode = str(comp.par.Atlascharset)
    if mode == 'dynamic':
        atlas_top.cook(force=True)  # full rebuild
    else:
        _update_word_widths(comp)   # ~0.2ms, skip glyph rendering

# charset_watcher (always full rebuild)
def onValueChange(par, prev):
    atlas_top.cook(force=True)
```

Also detect changes in the layout engine via text hash comparison (belt + suspenders).

### ASCII Multi-Scale Entries

For the `ascii` preset, palette chars are rendered at 3 scales (small/medium/large) keyed as `char_scaleName`:

```python
ASCII_SCALES = {'small': 0.6, 'medium': 1.0, 'large': 1.4}
# Keys: 'A_small', 'A_medium', 'A_large'
```

These are separate glyph entries in addition to the normal charset entries.
