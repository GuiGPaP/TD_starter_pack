# Layout Engine — Pretext-Aligned Obstacle Avoidance

## Algorithm Overview

Port of Pretext's `layoutNextLine` to Python. Three steps per frame:

1. **Build obstacles** (circles or bitmap spans)
2. **For each Y line**: compute available segments by subtracting obstacles ("carve slots")
3. **For each segment**: call `_layout_next_line(cursor, max_width)` — one call per slot

## Core Primitive: `_layout_next_line`

Mirrors Pretext v0.0.5's `layoutNextLine(prepared, cursor, maxWidth)`:

```python
def _layout_next_line(words, char_widths_norm, font_size, space_w,
                      default_w, cursor, max_width):
    """Returns ((end_word_idx, end_char_offset), fit_width) or None."""
    word_idx, char_offset = cursor
    fit_w = 0.0
    has_content = False
    pending_cursor = None   # Last viable break point
    pending_fit_w = 0.0

    while word_idx < n:
        word_w = measure(words[word_idx][char_offset:])
        space_before = space_w if has_content else 0
        new_w = fit_w + space_before + word_w

        if new_w <= max_width:
            # Word fits — record pending break (position AFTER this word)
            if has_content:
                pending_cursor = (word_idx + 1, 0)
                pending_fit_w = new_w
            fit_w = new_w
            has_content = True
            word_idx += 1; char_offset = 0
        else:
            # Overflow — revert to pending break or char-by-char for first word
            if not has_content:
                return char_by_char_break(word_idx, char_offset, max_width)
            if pending_cursor:
                return (pending_cursor, pending_fit_w)
            return ((word_idx, char_offset), fit_w)
```

### Key Pretext alignments (v0.0.5)
- **Cursor-based**: `(word_idx, char_offset)` advances across calls, like Pretext's `LayoutCursor`
- **Pending break**: overflow reverts to last space, not char-by-char mid-word
- **Fit/paint width**: trailing spaces don't count for break decisions
- **Char-by-char fallback**: only for oversized first word on a line

### What's NOT ported (not needed for dense Latin text)
- Soft hyphens, tabs, hard breaks (`SegmentBreakKind`)
- `Intl.Segmenter` (CJK/Thai/Arabic segmentation)
- Bidi, rich-inline (chips/mentions)
- Fit vs paint advance arrays

### Native vs POP differences
- **Native** (`_layout_line`): spaces are separate "words" in `_words` list → trailing space stripping is implicit. Already Pretext-aligned.
- **POP** (`_layout_next_line`): spaces are implicit between `text.split(' ')` words → explicit pending break tracking needed.

## Circle Obstacle Segments

Identical math to Pretext's `buildSegments`:

```python
for obstacle in obstacles:
    dy = abs(baseline_y - oy)
    if dy >= radius: continue
    dx = sqrt(r*r - dy*dy)
    left, right = ox - dx, ox + dx
    # Subtract [left, right] from available segments
```

## Bitmap Obstacle Spans (numpy-optimized)

### Reading Spans from Mask TOP

```python
alpha = mask.numpyArray()[::-1, :, 3]  # flip Y in one numpy op
padded = np.concatenate(([False], alpha[row] > 0.25, [False]))
diffs = np.diff(padded.astype(np.int8))
starts = np.where(diffs == 1)[0]
ends = np.where(diffs == -1)[0]
```

**42x faster** than Python row-by-row scanning.

### Span Caching

```python
# Cache spans by alpha hash — only recompute when mask changes
alpha_hash = int(np.sum(alpha) * 1000)
if alpha_hash == _cached_hash:
    return _cached_spans
```

### Margin Dilation

Expand blocked spans by N pixels for cleaner text flow:
```python
raw.append((span_start * W - margin, span_end * W + margin))
```

## Data Flow Between Operators

```
layout_engine (Execute DAT, onFrameEnd)
    → comp.store('_layout_instances', [(x, y, char), ...])
    → glyph_data (Script CHOP) reads from storage on cook
```

**CRITICAL**: Do NOT call `glyph_data.cook(force=True)` from `onFrameEnd` — causes infinite cook loop and TD crash. The Script CHOP reads storage passively on its own cook cycle.

## Performance Tips

| Technique | Impact |
|-----------|--------|
| Pre-compute `_char_w_array` as numpy array | Enables cumsum line breaking |
| Cache bitmap spans with hash | 42x faster (0.03ms vs 1.28ms) |
| Pre-allocate output arrays (`np.zeros(max)`) | Avoid list append overhead |
| Skip leading spaces at line start | Avoid unnecessary iterations |
| `min_seg = 40` for bitmap mode | Allow text in narrow gaps |

## Coordinate System

- Layout Y: 0 = top of screen, increases downward
- TD render Y: 0 = bottom, increases upward
- Conversion in glyph_script: `ty = -(layout_y - char_height * 0.5)`
- Camera centered at `(W/2, -H/2)` with ortho projection
