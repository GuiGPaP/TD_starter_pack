# td-sketch-ui — Sketch to TouchDesigner UI

Convert hand-drawn UI sketches (paper photos, wireframes, mockups) into functional TouchDesigner panels using Palette Basic Widgets.

## When to Use

Trigger when user provides an image of a UI sketch/wireframe and wants it built in TouchDesigner.

## Prerequisites

- TouchDesigner running and connected via MCP
- Palette indexed (`index_palette` — cached after first run)

## Critical Rules (learned from real builds)

### 1. Two-level widget architecture — ALWAYS configure both levels
Every Palette widget loads as: `containerCOMP` (outer) → `widgetCOMP` (inner).
- **Outer** controls layout: `hmode`, `vmode`, `w`, `h`, `alignorder`
- **Inner** controls behavior: `Value0`, `Widgetlabel`, colors, etc.

After loading ANY widget, ALWAYS run:
```python
for child in op('{container_path}').children:
    # Outer: fill parent
    child.par.hmode = 'fill'
    child.par.vmode = 'fill'  # or 'fixed' with explicit h
    child.par.alignorder = {i}
    # Inner: fill outer — MANDATORY or widgets will be cropped/misaligned
    if child.children:
        inner = child.children[0]
        inner.par.hmode = 'fill'
        inner.par.vmode = 'fill'
```

### 2. Inner widget sub-components must ALSO be set to fill
Widgets like `knobFixed`, `slider2D`, `buttonMomentary` have internal sub-components (Knob, 2DSlider, Button) with their own sizing. These default to `fixed` and must be set to `fill`:

| Widget | Internal sizing pars to set to `'fill'` |
|--------|----------------------------------------|
| `knobFixed` / `knobEndless` | `Knobhorizontalmode`, `Knobverticalmode` |
| `slider2D` | `Slider2dhorizontalmode`, `Slider2dverticalmode` |
| `buttonMomentary` / `buttonToggle` / `buttonCheckbox` | `Buttonhorizontalmode`, `Buttonverticalmode` |
| `sliderHorz` / `sliderVert` | (inner fill is usually enough) |

### 3. Don't add labels unless the user asked for them
- Set `Labeldisplay = False` on all widgets by default
- Only show labels when the sketch explicitly has text annotations next to controls
- For knobs: `Knoblabel` is the text INSIDE the dial (default "A"), `Widgetlabel` is the external label

### 4. Button text lives in Button page, not Label page
- `Buttonofflabel` / `Buttononlabel` — text displayed ON the button face
- `Buttonfont` — defaults to "Material Design Icons" (shows icons). Set to `'Arial'` for text
- `Buttonofffacecolorr/g/b` / `Buttononfacecolorr/g/b` — button colors (off/on states)
- `Buttonofffontcolorr/g/b` / `Buttononfontcolorr/g/b` — text colors

### 5. Disable rollover on ALL widgets
Rollover causes FPS drops when the mouse moves over widgets. Always disable:
```python
inner.par.Enablerollover = False
```

### 6. Container height — calculate, don't guess
```python
total = sum(child.par.h.val for child in parent.children)
total += parent.par.spacing.val * (len(parent.children) - 1)
parent.par.h = int(total) + 4  # small padding
```

### 7. Grid layout: use sub-containers, not gridrows/gridcols
`gridrows`/`gridcols` with `alignmax` is unreliable. For a 2-column grid:
```
container (horizlr)
  ├── col_left (verttb, fill)
  │     ├── widget1
  │     ├── widget2
  │     └── widget3
  └── col_right (verttb, fill)
        ├── widget4
        ├── widget5
        └── widget6
```

### 8. folderTabs configuration
Tab names are set via string pars on the inner widgetCOMP (NOT via menuNames on Value0):
```python
inner = op('{tabs_path}/folderTabs')
inner.par.Menunames = 'tab1 tab2 tab3'        # space-separated names (no spaces in names!)
inner.par.Menulabels = 'Label1 Label2 Label3'  # space-separated display labels (no spaces in labels!)
inner.par.Value0 = 'tab1'                      # default selected tab
```
For labels with spaces, use a `Menuoptiontable` DAT instead.

### 9. Page switching with folderTabs
Use `me.parent().op()` in display expressions — relative paths resolve from the operator's context:
```python
page.par.display.expr = "me.parent().op('tabs/folderTabs').par.Value0 == 'tabname'"
page.par.display.mode = page.par.display.mode.EXPRESSION
```

### 10. Error detection and cleanup
After building any UI, ALWAYS run `scan_network_errors` to check for problems.
If errors are cached/stale, force-cook the affected operators:
```python
op('{path}').cook(force=True)
```
Then rescan to confirm 0 errors.

### 11. No `containerCOMP` in exec namespace
`containerCOMP`, `tableDAT`, etc. are NOT available in `execute_python_script`. Use `create_td_node` MCP tool to create operators, then `execute_python_script` only for configuring parameters.

### 12. par.align uses string names, not integers
| par.align value | Mode |
|-----------------|------|
| `'horizlr'` | Left to Right |
| `'horizrl'` | Right to Left |
| `'verttb'` | Top to Bottom |
| `'vertbt'` | Bottom to Top |
| `'gridrows'` | Grid by Rows |
| `'gridcols'` | Grid by Columns |

## Workflow

### Step 1: Analyze the Sketch

Look at the image and identify:
1. **Elements**: What UI controls are visible (buttons, sliders, knobs, text fields, labels, menus, etc.)
2. **Hierarchy**: How elements are grouped (panels, sections, tabs)
3. **Layout**: Spatial arrangement — vertical stacks, horizontal rows, grids, nested groups
4. **Labels**: Any text annotations — only add labels if the user explicitly wrote them
5. **Proportions**: Relative sizes of elements to each other

Output a structured description before proceeding.

### Step 2: Map to Palette Widgets

| Sketch Element | Palette Widget | Notes |
|---|---|---|
| Rectangle with text (action) | `buttonMomentary` | Fires once on click |
| Rectangle with ON/OFF states | `buttonToggle` | Stays on/off |
| Checkbox / checkmark box | `buttonCheckbox` | Toggle with checkbox visual |
| Radio button / dot selector | `buttonRadio` | Exclusive selection in group |
| Rocker / switch | `buttonRocker` | Two-state rocker visual |
| Horizontal bar / slider | `sliderHorz` | 0-1 normalized value |
| Vertical bar / slider | `sliderVert` | 0-1 normalized value |
| 2D pad / XY control | `slider2D` | Two axes |
| Circle with indicator / knob | `knobFixed` | Rotary control, fixed range |
| Endless knob / rotary | `knobEndless` | No min/max, infinite rotation |
| Text input / edit field | `fieldString` | Editable string |
| Text area / multiline | `fieldTextArea` | Multiline text input |
| Number field / numeric input | `float1` | Single float with label |
| 2-4 number fields in row | `float2`/`float3`/`float4` | Multi-value (XY, RGB, RGBA) |
| Integer field | `int1` | Single integer |
| Range slider (min/max) | `range` | Dual-handle range |
| Color picker (RGB) | `slider3Rgb` | 3 sliders R/G/B |
| Color picker (HSV) | `slider3Hsv` | 3 sliders H/S/V |
| Color picker (RGBA) | `slider4Rgba` | 4 sliders with alpha |
| Dropdown / select menu | `dropDownMenu` | Click to reveal options |
| Text label / annotation | `label` | Static text display |
| Section title / heading | `header` | Bold title bar |
| Window title bar | `windowHeader` | Draggable window header |
| Collapsible group | `section` | Expandable/collapsible section |
| Tab bar / page selector | `folderTabs` | Switchable tab navigation |
| File path input | `fieldFileBrowser` | String + browse button |
| Crossfader | `sliderHorzXFade` | Horizontal crossfade slider |

### Step 3: Build the UI

#### 3a. Create containers via `create_td_node` (NOT execute_python_script)
```
create_td_node:
  parentPath: /project1
  nodeType: containerCOMP
  nodeName: ui_panel
```

Then configure via `execute_python_script`:
```python
n = op('{root_path}')
n.par.w = {total_width}
n.par.h = {total_height}
n.par.align = 'verttb'
n.par.spacing = 2
```

#### 3b. Load widgets from Palette
```
load_palette_component:
  name: {widget_palette_name}
  parentPath: {parent_container_path}
  componentName: {descriptive_name}
```

#### 3c. Configure ALL sizing levels (critical checklist)
For every loaded widget, in a single `execute_python_script`:
```python
outer = op('{widget_path}')
outer.par.hmode = 'fill'
outer.par.vmode = 'fill'  # or 'fixed' + explicit h
outer.par.alignorder = {order}

inner = outer.children[0]
inner.par.hmode = 'fill'
inner.par.vmode = 'fill'
inner.par.Labeldisplay = False
inner.par.Enablerollover = False

# Widget-specific internal fill (check reference for each type):
# inner.par.Knobhorizontalmode = 'fill'  # knobs
# inner.par.Slider2dhorizontalmode = 'fill'  # slider2D
# inner.par.Buttonhorizontalmode = 'fill'  # buttons
```

#### 3d. Set button text with Arial font
```python
inner.par.Buttonfont = 'Arial'
inner.par.Buttonofflabel = 'My Label'
inner.par.Buttononlabel = 'My Label'
```

### Step 4: Verify (mandatory)

1. Run `scan_network_errors` on the root container — must be **0 errors**
2. If errors found: `op('{path}').cook(force=True)` on affected ops, rescan
3. Ask user for a screenshot to compare with sketch
4. Check `get_performance` — FPS should stay at 60

## Widget-Specific Internal Sizing Reference

| Widget Type | Internal H-mode par | Internal V-mode par | Default | Must set to |
|-------------|--------------------|--------------------|---------|-------------|
| `knobFixed` | `Knobhorizontalmode` | `Knobverticalmode` | `fixed` | `'fill'` |
| `knobEndless` | `Knobhorizontalmode` | `Knobverticalmode` | `fixed` | `'fill'` |
| `slider2D` | `Slider2dhorizontalmode` | `Slider2dverticalmode` | `fixed` | `'fill'` |
| `buttonMomentary` | `Buttonhorizontalmode` | `Buttonverticalmode` | `fixed`/`fill` | `'fill'` |
| `buttonToggle` | `Buttonhorizontalmode` | `Buttonverticalmode` | `fixed`/`fill` | `'fill'` |
| `buttonCheckbox` | `Buttonhorizontalmode` | `Buttonverticalmode` | `fixed`/`fill` | `'fill'` |
| `sliderHorz` | — | — | — | inner fill is enough |
| `sliderVert` | — | — | — | inner fill is enough |
| `folderTabs` | — | — | — | inner fill is enough |

## Knob-Specific Parameters

| Parameter | Purpose | Default |
|-----------|---------|---------|
| `Knoblabel` | Text displayed INSIDE the knob dial | `"A"` |
| `Knoblabeldisplay` | Show/hide knob dial text | `True` |
| `Knobfontsize` | Font size of dial text | `20` |
| `Knobsensitivity` | Mouse drag sensitivity | `1.0` |
| `Knobdialscale` | Visual size of the dial | `0.686` |

## folderTabs Reference

### Configuration
```python
inner = op('{path}/folderTabs')
inner.par.Menunames = 'tab1 tab2'       # space-separated, NO spaces in names
inner.par.Menulabels = 'Tab1 Tab2'      # display labels, NO spaces
inner.par.Value0 = 'tab1'               # default tab
```
For labels with spaces: use `Menuoptiontable` pointing to a table DAT with `name`/`label` columns.

### Page switching
```python
page.par.display.expr = "me.parent().op('tabs/folderTabs').par.Value0 == 'tab1'"
page.par.display.mode = page.par.display.mode.EXPRESSION
```

### Outputs
- `out_menu0Index` (outCHOP) — numeric index of selected tab
- `out_menu1Selected` (outDAT) — selected row
- `out_menu2Options` (outDAT) — all tab options

## Limitations

- Palette widgets must be loaded one at a time (no batch loading)
- `get_node_parameter_schema` does not work on widgetCOMPs — use `execute_python_script` to read/write custom pars
- `screenshot_operator` only works on TOPs, not COMPs — ask user for visual verification
- TD type constants (`containerCOMP`, `tableDAT`) not available in exec namespace — use `create_td_node` MCP tool
- Grid align modes (`gridrows`/`gridcols` + `alignmax`) are unreliable — use nested sub-containers instead
- Expression errors can persist in cache — force-cook affected operators to clear
