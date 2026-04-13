# Layout Patterns for TD Sketch-UI

Reusable layout patterns for building UIs from sketches. Each pattern includes the MCP tool calls and Python scripts needed to execute it.

---

## Pattern 1: Vertical Control Panel

The most common UI layout — a stack of labeled controls.

```
┌─────────────────────┐
│  Header: "Controls" │
├─────────────────────┤
│  Slider: Speed      │
│  Slider: Scale      │
│  Knob: Rotation     │
│  Toggle: Enable     │
│  Button: Reset      │
└─────────────────────┘
```

### Build sequence

```python
# 1. Create root container
root = op('/project1').create(containerCOMP, 'controls_panel')
root.par.w = 350
root.par.h = 250
root.par.align = 'verttb' # Top to Bottom
root.par.spacing = 2
```

Then via MCP:
```
load_palette_component: header → /project1/controls_panel
load_palette_component: sliderHorz → /project1/controls_panel  (x2)
load_palette_component: knobFixed → /project1/controls_panel
load_palette_component: buttonToggle → /project1/controls_panel
load_palette_component: buttonMomentary → /project1/controls_panel
```

Configure each widget's outer container:
```python
# Set all children to fill width, fixed height
for i, child in enumerate(op('/project1/controls_panel').children):
    child.par.hmode = 'fill'        # stretch to parent width
    child.par.vmode = 'fixed'
    child.par.h = 26 if child.name != 'header' else 30
    child.par.alignorder = i
```

---

## Pattern 2: Horizontal Toolbar

A row of buttons across the top.

```
┌──────┬──────┬──────┬──────┬────────────┐
│ Play │ Stop │ Rec  │ Loop │            │
└──────┴──────┴──────┴──────┴────────────┘
```

### Build sequence

```python
root = op('/project1').create(containerCOMP, 'toolbar')
root.par.w = 600
root.par.h = 30
root.par.align = 'horizlr' # Left to Right
root.par.spacing = 2
```

Load 4x `buttonMomentary`, configure:
```python
for i, child in enumerate(op('/project1/toolbar').children):
    child.par.hmode = 'fixed'
    child.par.w = 80
    child.par.vmode = 'fill'       # stretch to parent height
    child.par.alignorder = i
```

---

## Pattern 3: Sectioned Panel (Collapsible Groups)

Groups of controls organized by section.

```
┌─────────────────────┐
│ ▼ Transform         │
│   Float3: Position  │
│   Float3: Rotation  │
│   Float3: Scale     │
│ ▼ Material          │
│   Slider3Rgb: Color │
│   Slider: Roughness │
│   Toggle: Metallic  │
│ ▶ Advanced (closed) │
└─────────────────────┘
```

### Build sequence

```python
root = op('/project1').create(containerCOMP, 'inspector')
root.par.w = 350
root.par.h = 500
root.par.align = 'verttb' # Top to Bottom
root.par.spacing = 0
```

For each section group:
```
# Section header (collapsible)
load_palette_component: section → /project1/inspector

# Section content container
create_td_node:
  parentPath: /project1/inspector
  nodeType: containerCOMP
  nodeName: section_transform_content
```

```python
# Configure section content container
content = op('/project1/inspector/section_transform_content')
content.par.align = 5         # vertical stack inside
content.par.spacing = 2
content.par.hmode = 'fill'
content.par.vmode = 'fixed'
content.par.h = 80            # height for 3 x 26px widgets
```

Then load widgets into each content container.

**Note**: Automatic collapse/expand wiring between `section` toggle and content container visibility requires a Panel Execute DAT or expression binding. For basic layouts, skip auto-collapse.

---

## Pattern 4: Tab Navigation

Switchable panels via tabs.

```
┌─────────┬──────────┬──────────┐
│ General │ Advanced │ About    │
├─────────┴──────────┴──────────┤
│                               │
│   (content of selected tab)   │
│                               │
└───────────────────────────────┘
```

### Build sequence

1. Create root via `create_td_node` (NOT Python — `containerCOMP` not in exec namespace):
```
create_td_node: parentPath=/project1, nodeType=containerCOMP, nodeName=tabbed_panel
```

Then configure:
```python
root = op('/project1/tabbed_panel')
root.par.w = 400
root.par.h = 400
root.par.align = 'verttb'
root.par.spacing = 0
```

2. Load folderTabs:
```
load_palette_component: folderTabs → /project1/tabbed_panel (componentName: tabs)
```

3. Configure tabs (outer + inner + menu names):
```python
# Outer layout
tabs_outer = op('/project1/tabbed_panel/tabs')
tabs_outer.par.hmode = 'fill'
tabs_outer.par.vmode = 'fixed'
tabs_outer.par.h = 28
tabs_outer.par.alignorder = 0

# Inner: fill + configure tab names
tabs_inner = tabs_outer.children[0]
tabs_inner.par.hmode = 'fill'
tabs_inner.par.vmode = 'fill'
tabs_inner.par.Menunames = 'general advanced about'  # space-separated, NO spaces in names
tabs_inner.par.Menulabels = 'General Advanced About'  # display labels
tabs_inner.par.Value0 = 'general'
tabs_inner.par.Enablerollover = False
tabs_inner.par.Labeldisplay = False
```

4. Create page containers via `create_td_node`, then configure:
```python
for i, name in enumerate(['general', 'advanced', 'about']):
    page = op(f'/project1/tabbed_panel/page_{name}')
    page.par.hmode = 'fill'
    page.par.vmode = 'fill'
    page.par.align = 'verttb'
    page.par.spacing = 2
    page.par.alignorder = i + 1
    # Page switching: display expression linked to tab value
    page.par.display.expr = f"me.parent().op('tabs/folderTabs').par.Value0 == '{name}'"
    page.par.display.mode = page.par.display.mode.EXPRESSION
```

5. Load widgets into each `page_*` container.

**Key rules for folderTabs:**
- `Menunames` is a space-separated string — NO spaces in individual names
- `Menulabels` is a space-separated string — for labels with spaces, use `Menuoptiontable` DAT instead
- Use `me.parent().op()` in display expressions (resolves from the page's context)
- Always `scan_network_errors` after setting expressions to catch path errors

---

## Pattern 5: Parameter Grid (Label + Value columns)

Side-by-side label and value layout.

```
┌──────────┬──────────────┐
│ Position │ [0.0] [0.0]  │
│ Scale    │ [1.0] [1.0]  │
│ Color    │ ████████████  │
│ Mode     │ [Dropdown ▼]  │
└──────────┴──────────────┘
```

### Build sequence

For this pattern, widgets with built-in labels (every Palette widget has `Widgetlabel`) handle both columns automatically. Just load them vertically:

```python
root = op('/project1').create(containerCOMP, 'param_grid')
root.par.w = 400
root.par.h = 130
root.par.align = 5
root.par.spacing = 2
```

```
load_palette_component: float2 → /project1/param_grid    (label: "Position")
load_palette_component: float2 → /project1/param_grid    (label: "Scale")
load_palette_component: slider3Rgb → /project1/param_grid (label: "Color")
load_palette_component: dropDownMenu → /project1/param_grid (label: "Mode")
```

Each widget already renders its label on the left and the control on the right.

---

## Pattern 6: Floating Window

A self-contained draggable panel.

```
┌─ Window Title ──── [×] ┐
│                         │
│   (panel content)       │
│                         │
├─────────────────────────┤
│  Status: OK             │
└─────────────────────────┘
```

### Build sequence

```python
root = op('/project1').create(containerCOMP, 'floating_window')
root.par.w = 350
root.par.h = 400
root.par.align = 5
root.par.spacing = 0
```

```
load_palette_component: windowHeader → /project1/floating_window
```

```python
# Window header - fill width, fixed height
wh = op('/project1/floating_window/windowHeader')
wh.par.hmode = 'fill'
wh.par.vmode = 'fixed'
wh.par.h = 30
wh.par.alignorder = 0

# Content area
content = op('/project1/floating_window').create(containerCOMP, 'content')
content.par.hmode = 'fill'
content.par.vmode = 'fill'     # takes all remaining space
content.par.align = 5
content.par.spacing = 2
content.par.alignorder = 1
```

```
load_palette_component: footer → /project1/floating_window
```

```python
ft = op('/project1/floating_window/footer')
ft.par.hmode = 'fill'
ft.par.vmode = 'fixed'
ft.par.h = 26
ft.par.alignorder = 2
```

Load controls into `content` container.

---

## Layout Cheat Sheet

### Container alignment values
| par.align | Direction |
|-----------|-----------|
| `horizlr` | Left to Right |
| `horizrl` | Right to Left |
| `verttb` | Top to Bottom |
| `vertbt` | Bottom to Top |
| `gridrows` | Grid by Rows |
| `gridcols` | Grid by Columns |

### Sizing modes
```python
n.par.hmode = 'fixed'     # use par.w (pixels)
n.par.hmode = 'fill'      # stretch to parent
n.par.hmode = 'anchors'   # normalized 0-1 from parent edges

n.par.vmode = 'fixed'     # use par.h (pixels)
n.par.vmode = 'fill'      # stretch to parent
n.par.vmode = 'anchors'   # normalized 0-1
```

### Fill weight (flex-grow equivalent)
```python
# When multiple children use fill, weight controls ratio
n.par.hfillweight = 2.0    # gets 2x width vs weight=1 siblings
n.par.vfillweight = 1.0
```

### Common widget height
Almost all Palette widgets look best at **26px** fixed height. Exceptions:
- `header`: 30px
- `knobFixed`/`knobEndless`: 80-100px (square-ish)
- `slider2D`: 150-200px (square)
- `fieldTextArea`: 80-150px
- `opViewer`: 150-300px

### Batch layout script
```python
# Apply consistent layout to all children of a container
parent = op('{container_path}')
for i, child in enumerate(parent.children):
    child.par.hmode = 'fill'        # full width
    child.par.vmode = 'fixed'       # fixed height
    child.par.h = 26
    child.par.alignorder = i        # stack order
    # CRITICAL: inner widgetCOMP must also fill its parent
    if child.children:
        inner = child.children[0]
        inner.par.hmode = 'fill'
        inner.par.vmode = 'fill'
```
