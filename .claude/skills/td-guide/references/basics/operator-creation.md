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

## Display/Render Flags (SOP)

```python
op('out1').display = True
op('out1').render = True
```

## Name Auto-Increment

If an operator with the same name exists, TD increments the number (`null1` -> `null2`). Always check the returned operator's `.name` if you need the actual name.

## Coordinate System

OpenGL right-handed: Y-up, Z toward camera, SRT order default.
