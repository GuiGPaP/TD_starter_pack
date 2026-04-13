# Palette Widget Catalog

Complete catalog of TouchDesigner Basic Widgets available via `load_palette_component`.

## Architecture

Every Palette widget loads as:
```
containerCOMP (wrapper)         ← controls layout: position, size, alignorder
  └── widgetCOMP (same name)    ← controls behavior: value, label, callbacks
```

**To set widget parameters**, target the inner widgetCOMP:
```
update_td_node_parameters:
  nodePath: /project1/ui_panel/{name}/{name}
  parameters: { Widgetlabel: "Speed" }
```

**To set layout**, target the outer containerCOMP:
```python
op('/project1/ui_panel/{name}').par.w = 300
op('/project1/ui_panel/{name}').par.h = 26
op('/project1/ui_panel/{name}').par.alignorder = 0
```

---

## Buttons

### buttonMomentary
- **Palette name**: `buttonMomentary`
- **Value type**: Toggle (momentary — True only while pressed)
- **Key params**: `Value0` (Toggle), `Widgetlabel` (Str, default "Momentary Button")
- **Default size**: 400 x 300 (wrapper) — **set to ~120 x 26**
- **Use for**: Action triggers, fire-once buttons

### buttonToggle
- **Palette name**: `buttonToggle`
- **Value type**: Toggle (latching — stays on/off)
- **Key params**: `Value0` (Toggle), `Widgetlabel` (Str, default "Toggle Button")
- **Default size**: set to ~120 x 26
- **Use for**: On/off switches, enable/disable states

### buttonCheckbox
- **Palette name**: `buttonCheckbox`
- **Value type**: Toggle
- **Key params**: `Value0` (Toggle), `Widgetlabel` (Str, default "Checkbox")
- **Default size**: set to ~200 x 26
- **Use for**: Boolean options with checkbox visual

### buttonRadio
- **Palette name**: `buttonRadio`
- **Value type**: Toggle (exclusive within group)
- **Key params**: `Value0` (Toggle), `Widgetlabel` (Str)
- **Use for**: Exclusive selection (one-of-many). Use multiple in same parent for radio group.

### buttonRocker
- **Palette name**: `buttonRocker`
- **Value type**: Toggle
- **Key params**: `Value0` (Toggle), `Widgetlabel` (Str)
- **Use for**: Two-state rocker switch visual

### buttonState
- **Palette name**: `buttonState`
- **Value type**: Toggle
- **Key params**: `Value0`, `Widgetlabel`
- **Use for**: Stateful button (visual feedback for current state)

### buttonScript
- **Palette name**: `buttonScript`
- **Value type**: Toggle
- **Key params**: `Value0`, `Widgetlabel`, `Offtoonscript0`
- **Use for**: Button that executes Python script on press

---

## Sliders

### sliderHorz
- **Palette name**: `sliderHorz`
- **Value type**: Float (0.0 - 1.0 normalized)
- **Key params**: `Value0` (Float), `Widgetlabel` (Str, default "Slider Horizontal")
- **Recommended size**: 300 x 26
- **Use for**: Most common continuous value control

### sliderVert
- **Palette name**: `sliderVert`
- **Value type**: Float (0.0 - 1.0)
- **Key params**: `Value0` (Float), `Widgetlabel`
- **Recommended size**: 26 x 200
- **Use for**: Vertical faders (audio mixing, tower controls)

### sliderHorzXFade
- **Palette name**: `sliderHorzXFade`
- **Value type**: Float
- **Key params**: `Value0`, `Widgetlabel`
- **Use for**: Crossfade between two sources (A/B mixing)

### slider2D
- **Palette name**: `slider2D`
- **Value type**: Two floats (X, Y)
- **Key params**: `Value0` (X), `Value1` (Y), `Widgetlabel`
- **Recommended size**: 200 x 200
- **Use for**: XY pad controls, position pickers

### slider3Rgb
- **Palette name**: `slider3Rgb`
- **Value type**: Three floats (R, G, B)
- **Key params**: `Value0`-`Value2`, `Widgetlabel`
- **Recommended size**: 300 x 78 (3 x 26)
- **Use for**: RGB color picker

### slider3Hsv
- **Palette name**: `slider3Hsv`
- **Value type**: Three floats (H, S, V)
- **Key params**: `Value0`-`Value2`, `Widgetlabel`
- **Recommended size**: 300 x 78
- **Use for**: HSV color picker

### slider4Rgba
- **Palette name**: `slider4Rgba`
- **Value type**: Four floats (R, G, B, A)
- **Key params**: `Value0`-`Value3`, `Widgetlabel`
- **Recommended size**: 300 x 104 (4 x 26)
- **Use for**: RGBA color picker with alpha

### slider4Hsva
- **Palette name**: `slider4Hsva`
- **Value type**: Four floats (H, S, V, A)
- **Recommended size**: 300 x 104
- **Use for**: HSVA color picker with alpha

---

## Knobs

### knobFixed
- **Palette name**: `knobFixed`
- **Value type**: Float (0.0 - 1.0)
- **Key params**: `Value0` (Float), `Widgetlabel` (Str, default "Knob Fixed"), `Knoblabel` (Str, default "A" — text displayed **inside** the knob dial)
- **Knob-specific params** (page "Knob"): `Knoblabel`, `Knoblabeldisplay`, `Knobfontsize`, `Knobsensitivity`, `Knobdialscale`, `Knoblevelscale`
- **Recommended size**: 80 x 100
- **Use for**: Rotary control with fixed range (like a volume knob)
- **Note**: `Knoblabel` sets the text inside the dial graphic. `Widgetlabel` is the external label next to it.

### knobEndless
- **Palette name**: `knobEndless`
- **Value type**: Float (unbounded)
- **Key params**: `Value0`, `Widgetlabel`
- **Recommended size**: 80 x 100
- **Use for**: Infinite rotation encoder (jog wheel, scroll-type input)

---

## Numeric Fields

### float1
- **Palette name**: `float1`
- **Value type**: Float
- **Key params**: `Value0` (Float, default 2.0), `Widgetlabel` (Str, default "Float1")
- **Recommended size**: 300 x 26
- **Use for**: Single floating-point value input with label

### float2 / float3 / float4
- **Palette names**: `float2`, `float3`, `float4`
- **Value types**: 2/3/4 Floats
- **Key params**: `Value0`-`Value3`, `Widgetlabel`
- **Recommended size**: 300 x 26
- **Use for**: XY, XYZ, XYZW vector inputs or RGB/RGBA values

### int1 / int2 / int3 / int4
- **Palette names**: `int1`, `int2`, `int3`, `int4`
- **Value types**: 1-4 Integers
- **Key params**: `Value0`-`Value3`, `Widgetlabel`
- **Recommended size**: 300 x 26
- **Use for**: Integer value inputs (counts, indices, pixel sizes)

### range
- **Palette name**: `range`
- **Value type**: Two floats (min, max)
- **Key params**: `Value0` (min), `Value1` (max), `Widgetlabel`
- **Recommended size**: 300 x 26
- **Use for**: Range selection with two handles

---

## Text Fields

### fieldString
- **Palette name**: `fieldString`
- **Value type**: Str
- **Key params**: `Value0` (Str, default "String"), `Widgetlabel` (Str, default "String Field")
- **Recommended size**: 300 x 26
- **Use for**: Single-line text input

### fieldStringExec
- **Palette name**: `fieldStringExec`
- **Value type**: Str
- **Key params**: `Value0`, `Widgetlabel`
- **Use for**: Text field that executes script on Enter

### fieldTextArea
- **Palette name**: `fieldTextArea`
- **Value type**: Str (multiline)
- **Key params**: `Value0`, `Widgetlabel`
- **Recommended size**: 300 x 100+
- **Use for**: Multiline text editing (notes, scripts, descriptions)

### fieldFileBrowser
- **Palette name**: `fieldFileBrowser`
- **Key params**: `Value0` (file path), `Widgetlabel`
- **Recommended size**: 300 x 26
- **Use for**: File path with browse button

### fieldFolderBrowser
- **Palette name**: `fieldFolderBrowser`
- **Key params**: `Value0` (folder path), `Widgetlabel`
- **Recommended size**: 300 x 26
- **Use for**: Folder path with browse button

---

## Menus

### dropDownMenu
- **Palette name**: `dropDownMenu`
- **Value type**: Menu
- **Key params**: `Value0` (Menu — selected value), `Value1` (Str — selected name), `Widgetlabel` (Str, default "Drop Down Menu")
- **Recommended size**: 300 x 26
- **Use for**: Single selection from a list of options
- **Note**: Menu options configured via menuNames/menuLabels on `Value0` par

### dropDownButton
- **Palette name**: `dropDownButton`
- **Key params**: `Value0`, `Widgetlabel`
- **Recommended size**: 200 x 26
- **Use for**: Button that opens a dropdown menu

### topMenu
- **Palette name**: `topMenu`
- **Recommended size**: fill x 26
- **Use for**: Horizontal menu bar (File, Edit, View...)

---

## Structure & Layout

### label
- **Palette name**: `label`
- **Key params**: `Widgetlabel` (Str, default "Label"), `Labelfontbold`, `Labelfontsize` (Int, default 10), `Labelalignx` (left/center/right), `Labelaligny`, `Labeloffsetx/y`
- **Recommended size**: 200 x 22
- **Use for**: Static text display, section descriptions, annotations

### header
- **Palette name**: `header`
- **Key params**: `Headerlabel` (Str, default "Header"), `Headerlabelfontbold` (Toggle, default True), `Headerlabelfontsize` (Int, default 12), `Headerlabelbgcolorr/g/b/a` (RGBA)
- **Recommended size**: fill x 30
- **Use for**: Section titles, panel headings
- **Note**: Uses `Headerlabel` not `Widgetlabel`

### windowHeader
- **Palette name**: `windowHeader`
- **Recommended size**: fill x 30
- **Use for**: Draggable window title bar (for floating panels)

### footer
- **Palette name**: `footer`
- **Recommended size**: fill x 26
- **Use for**: Bottom status bar, footer info

### section
- **Palette name**: `section`
- **Value type**: Toggle (expanded/collapsed state)
- **Key params**: `Value0` (Toggle, default True = expanded), `Buttonofflabel` / `Buttononlabel` (collapse icons), `Buttontype` (Menu)
- **Recommended size**: fill x 26 (header only, content below)
- **Use for**: Collapsible groups of controls

### folderTabs
- **Palette name**: `folderTabs`
- **Value type**: Menu (selected tab)
- **Key params**:
  - `Value0` (Menu — selected tab name, equals one of the Menunames)
  - `Menunames` (Str — space-separated tab names, e.g. `"tab1 tab2 tab3"`)
  - `Menulabels` (Str, optional — space-separated display labels, use `\\ ` for spaces in labels, e.g. `"DJ\\ Mixer XY\\ Pads"`)
  - `Menuoptiontable` (DAT — alternative: point to a table DAT with `name`/`label` columns)
  - `Widgetlabel` (Str, default "Folder Tabs")
- **Outputs**: `out_menu0Index` (outCHOP — numeric index), `out_menu1Selected` (outDAT — selected row), `out_menu2Options` (outDAT — all options)
- **Recommended size**: fill x 26
- **Use for**: Tab navigation to switch between views/panels
- **Page switching**: Use expression on each page container's `display` par: `op('tabs/folderTabs').par.Value0 == 'tabname'`

---

## OP References

### operatorPath
- **Palette name**: `operatorPath`
- **Key params**: `Value0` (OP path), `Widgetlabel`
- **Recommended size**: 300 x 26
- **Use for**: TD operator path selector with autocomplete

### referenceCHOP / referenceCOMP / referenceDAT / referenceMAT / referenceOBJ / referenceOP / referenceSOP / referenceTOP
- **Palette names**: `referenceCHOP`, `referenceCOMP`, etc.
- **Key params**: `Value0` (OP path), `Widgetlabel`
- **Use for**: Type-specific operator path references

### opViewer
- **Palette name**: `opViewer`
- **Use for**: Embedded viewer of any OP's output (preview window)
- **Recommended size**: 300 x 200+

---

## Utility

### pathBar
- **Palette name**: `pathBar` (in Gadgets/)
- **Use for**: Breadcrumb-style path navigation

### autoUI
- **Palette name**: `autoUI` (in Tools/)
- **Use for**: Auto-generates UI from an OP's custom parameters. Point it at a COMP and it builds a control panel automatically.

---

## Standalone UI Components (outside Basic Widgets)

These are in the `UI/` category but not part of Basic Widgets:

| Name | Description |
|------|-------------|
| `lister` | Full-featured scrollable list with columns, sorting, searching |
| `simpleList` | Lightweight list widget |
| `treeLister` | Hierarchical tree view |
| `radioList` | List with radio selection |
| `displayList` | Read-only display list |
| `popDialog` | Popup dialog box (OK/Cancel) |
| `popMenu` | Popup context menu |
| `gal` | Gallery/grid view |

---

## Common Parameter Patterns

### All value widgets share (Values page):
```
Value0          — Primary value
Valname0        — Channel name
Onvaluechangescript0  — Script on change
Offtoonscript0  — Script 0→1
Ontooffscript0  — Script 1→0
Valueparexec    — DAT for value callbacks
```

### All labeled widgets share (Label page):
```
Widgetlabel     — Display text (Str)
Labeldisplay    — Show label (Toggle, default True)
Labelfontsize   — Size (Int, default 10)
Labelfontbold   — Bold (Toggle, default False)
Labelitalic     — Italic (Toggle, default False)
Labelalignx     — H-align: left/center/right
Labelaligny     — V-align: top/center/bottom
Labeloffsetx/y  — Pixel offset (XYZW)
Labelwordwrap   — Wrap text (Toggle, default False)
```
