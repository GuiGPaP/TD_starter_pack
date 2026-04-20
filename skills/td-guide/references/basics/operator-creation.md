# Operator Creation

Create, position, and connect operators in a TouchDesigner network via MCP.

```python
base = op('/project1/base1')
new_op = base.create(gridSOP, 'grid1')
new_op.viewer = True
```

## MCP Runtime Note

In `execute_python_script`, the namespace provides `op`, `ops`, `td`, `project`. **`parent` is a string path, not an OP.** Always resolve containers explicitly:

```python
base = op('/project1/base1')  # OP object — supports .create(), .children, etc.
```

## Positioning

**Simple operators** (no docked DATs): direct assignment.

```python
new_op.nodeX = 0
new_op.nodeY = 0
```

**GLSL TOP/MAT and Script SOP** have docked DATs. Setting `nodeX`/`nodeY` on the main op does NOT move them. Use The Docked-Move Pattern:

```python
def move_with_docked(target, x, y):
    dx, dy = x - target.nodeX, y - target.nodeY
    target.nodeX, target.nodeY = x, y
    for d in target.docked:
        d.nodeX += dx
        d.nodeY += dy
```

> Also available via `from td_helpers.layout import move_with_docked`

## Connecting

```python
# Single connection
op('noise1').inputConnectors[0].connect(op('sphere1'))

# Chain multiple operators (same family only)
ops_list = [grid, noise, null_op]
for i in range(1, len(ops_list)):
    ops_list[i].inputConnectors[0].connect(ops_list[i-1])
    ops_list[i].nodeX = ops_list[i-1].nodeX + 200
    ops_list[i].nodeY = ops_list[i-1].nodeY
```

> Also available via `from td_helpers.layout import chain_ops`

## Parameters

```python
op('mysphere').par.frequency = 10

# Expression mode
op('mysphere').par.tx.mode = ParMode.EXPRESSION
op('mysphere').par.tx.expr = 'absTime.seconds'
```

**Always verify parameter names first.** TD names are unpredictable (e.g., `radius` vs `radx/rady/radz`):

```python
params = [p.name for p in op('sphere1').pars() if 'rad' in p.name.lower()]
print(params)  # ['radx', 'rady', 'radz']
```

### textCOMP: Newlines and Formatting

`par.text` in **constant mode** treats escape sequences as literals — `\n` renders as-is, not as a newline.

```python
# BAD — all on one line in constant mode
txt.par.text = "line1\nline2"

# GOOD — use expression mode
txt.par.text.expr = repr("line1\nline2")
```

For rich text with inline colors, use [Text Formatting Codes](https://derivative.ca/UserGuide/Text_Formatting_Codes) with `par.formatcodes = True`:

```python
txt = comp.create("textCOMP", "status_display")
txt.par.formatcodes = True
txt.par.text.expr = repr(
    "{#color(100,220,100)}green text{#reset()}\n"
    "white text\n"
    "{#color(220,80,80)}red text{#reset()}"
)
```

Formatting codes: `{#color(R,G,B)}` sets text color (0-255), `{#reset()}` resets. Other codes: `{#under(true)}`, `{#strike(true)}`, `{#scale(x,y)}`.

## Display/Render Flags (SOP)

```python
op('out1').display = True
op('out1').render = True
```

## Name Auto-Increment

If an operator with the same name exists, TD increments the number (`null1` -> `null2`). Always check the returned operator's `.name` if you need the actual name.

## Auto-Spawned Companion DATs

Some operators automatically spawn a sibling textDAT with callback boilerplate when created via `create_td_node` / palette / `base.create()`:

| Operator | Auto-spawned sibling |
|---|---|
| `scriptDAT` | `<name>_callbacks` textDAT |
| `scriptSOP` / `scriptCHOP` / `scriptTOP` | `<name>_callbacks` textDAT |
| `executeDAT` / `chopexecuteDAT` / `datexecuteDAT` / `parameterexecuteDAT` | Self-contained — `.text` IS the callback code |
| `timerCHOP` | `<name>_callbacks` textDAT (via "Setup Parameters") |

The companion DAT is a **sibling, not docked** (`op.docked` is empty). The main op's `.par.callbacks` already points to it.

**Pitfall via MCP:** if you call `create_td_node` for the scriptDAT and then again for `<name>_callbacks` to hold your own code, the second call gets suffixed to `<name>_callbacks1`, leaving the boilerplate orphan in place.

```python
# WRONG — creates a duplicate
create_td_node(parentPath='/foo', nodeType='scriptDAT', nodeName='my_dat')
create_td_node(parentPath='/foo', nodeType='textDAT', nodeName='my_dat_callbacks')  # becomes my_dat_callbacks1

# RIGHT — reuse the auto-spawned one
create_td_node(parentPath='/foo', nodeType='scriptDAT', nodeName='my_dat')
set_dat_text(nodePath='/foo/my_dat_callbacks', text='def onCook(scriptOp): ...')
```

If you've already created the duplicate, delete the boilerplate and rename yours:

```python
op('/foo/my_dat_callbacks').destroy()
op('/foo/my_dat_callbacks1').name = 'my_dat_callbacks'
op('/foo/my_dat').par.callbacks = 'my_dat_callbacks'
```

## Extension Wiring on baseCOMP

To add a Python extension to a dynamically created baseCOMP:

```python
comp = parent_op.create(baseCOMP, 'myComp')

# 1. Enable extension slots (sequence parameter)
comp.par.ext.sequence.numBlocks = 1

# 2. Create the extension textDAT with inline code (recommended)
ext_dat = comp.create(textDAT, 'my_ext')
ext_dat.text = '''
class MyExt:
    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
    def onParPulse(self, par):
        pass
'''

# 3. Set ext0object in CONSTANT mode (NOT expression)
comp.par.ext0object.val = "op('./my_ext').module.MyExt(me)"
comp.par.ext0promote.val = True

# 4. Reinit
comp.par.reinitextensions.pulse()
```

**Critical rules:**
- `ext0object` must be **CONSTANT mode** — this is how TDDocker does it. Expression mode works but is less reliable.
- **`project` is NOT available** in the ext0object evaluation context. Do not use `project.folder` in module-level code or `__init__`. Resolve paths inside methods instead (called later when `project` is available).
- **Inline extensions** (code in textDAT) are more reliable than external file imports for dynamically created COMPs.
- Use `parexecDAT` to route parameter callbacks to the extension (TD promote doesn't fire reliably on dynamic baseCOMPs).

## Coordinate System

OpenGL right-handed: Y-up, Z toward camera, SRT order default.
