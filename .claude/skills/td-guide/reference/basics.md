# Basics Reference

## Contents

1. [Coordinate System](#coordinate-system)
2. [Basic Operations](#basic-operations)
3. [Pattern Matching](#pattern-matching)
4. [Network Design Patterns](#network-design-patterns)
5. [Debugging](#debugging)
6. [Saving Data](#saving-data)

---

## Coordinate System

OpenGL (right-handed): Y-up, Z toward camera, SRT order default.

---

## Basic Operations

### Create Operator

```python
# Create and position an operator
new_op = parent.create(glslTOP, 'glsl1')
new_op.viewer = True
new_op.nodeX = 0
new_op.nodeY = 0
```

**Why `viewer = True`:** Matches UI-created operator behavior. Without it, operators appear collapsed.

**Name auto-increment:** If an operator with the same name exists, TD automatically increments the number (e.g., `null1` → `null2`). Always check the returned operator's `.name` if you need the actual name.

**Docked operators:** GLSL TOP/MAT create associated DATs (_pixel, _vertex, etc.). When moving operators, iterate over `.docked` to move them together:

```python
# Move operator and its docked DATs together
def move_op(target, x, y):
    dx = x - target.nodeX
    dy = y - target.nodeY
    target.nodeX = x
    target.nodeY = y
    for d in target.docked:
        d.nodeX += dx
        d.nodeY += dy
```

### Connect

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

### Parameters

```python
op('mysphere').par.frequency = 10

# Expression mode
op('mysphere').par.tx.mode = ParMode.EXPRESSION
op('mysphere').par.tx.expr = 'absTime.seconds'
```

### Display/Render Flags (SOP)

```python
op('out1').display = True
op('out1').render = True
```

### Position

```python
op('sphere1').nodeX = 0
op('sphere1').nodeY = 0
```

### Data Access

```python
# CHOP
chop = op('sopto1')
chop.numSamples
chop.chan('tx')[0]      # Single value
chop.chan('tx').vals    # All values

# DAT
dat = op('text1')
dat.text                # Full text
dat.text = 'new'        # Set text
dat[0, 0].val           # Cell value
```

### Find Parameters

**Always verify parameter names before setting them.** TD parameter names are often unpredictable (e.g., `radius` vs `radx/rady/radz`).

```python
# Check parameters before setting
sphere = op('/project1/base1/sphere1')
print([p.name for p in sphere.pars() if 'rad' in p.name.lower()])
# Output: ['radx', 'rady', 'radz']
```

```python
# Search for specific parameter patterns
for p in op('glsl1').pars():
    if 'vec' in p.name.lower():
        print(f"{p.name}: {p.val}")
```

---

## Pattern Matching

Many parameters accept wildcards to specify multiple operators, channels, etc.

### Wildcards

| Pattern | Matches |
|---------|---------|
| `*` | Any string (including empty) |
| `?` | Any single character |
| `[xyz]` | Any character in brackets |
| `^name` | Exclude (after other patterns) |

### Examples

```python
# Render TOP - geometry/lights parameters
render.par.geometry = 'geo*'           # All geo1, geo2, geo3...
render.par.lights = 'light*'           # All lights
render.par.geometry = 'geo* ^geo7'     # All geo* except geo7

# Find operators
ops('null*')                           # All nulls
ops('*chop*')                          # Anything with 'chop' in name

# Find parameters
op('geo1').pars('t?')                  # tx, ty, tz
op('geo1').pars('t?', 'r?', 's?')      # translate/rotate/scale
```

---

## Network Design Patterns

### Always Use Null as Intermediary

Before any reference, insert a Null:

```
grid1 → null1 → sopto1
render1 → null_out
```

### Use Relative Paths for References

**DO NOT use absolute paths for nearby operators.**

```python
# BAD - Breaks when moving/copying network
geo.par.instanceop = '/project1/base1/null_chop'  # WRONG!

# GOOD - Use relative paths
geo.par.instanceop = 'null_chop'   # Same level
render.par.camera = '../cam1'      # Parent level
```

**When to use relative vs absolute:**
- Same level or nearby hierarchy → **Relative** (e.g., `null1`, `../cam1`)
- Global/shared resources → **Absolute** (e.g., `/project1/shared/texture1`)

### Layout Rules

- Data flows **left to right** (increasing X)
- COMP hierarchy flows **top to bottom**
- **Check layout before creating** to avoid overlap

### Spacing

| Direction | Spacing | Notes |
|-----------|---------|-------|
| X | 200+ | Horizontal chain |
| Y | 130+ | SOP/TOP/CHOP/DAT |
| Y | 160+ | COMP (larger) |

### Type Conversion: Stack Vertically

When operator type changes (SOP→CHOP), keep same X, stack Y:

```
null1 (X=200, Y=-270) [SOP]
    ↓
sopto1 (X=200, Y=-145) [CHOP] → null2 (X=400)
```

### Docked Operators

GLSL TOP/MAT, Script SOP create associated DATs.

- Use the `move_op` helper (see Basic Operations) to move them together
- `GetBounds` should account for docked operators
- Setting `nodeX`/`nodeY` directly does NOT move docked operators

---

## Debugging

### Check Errors

```python
# Check errors on a container recursively
err = op('/project1/base1').errors(recurse=True)
print(err)
```

**IMPORTANT: Error Cache Timing**

TD updates error state on frame boundaries. When fixing errors via MCP:

1. Fix in one `execute_python_script` call
2. Check errors in a **separate** `execute_python_script` call

```python
# Call 1: Fix the error
const.par.value.expr = 'math.sin(absTime.seconds)'

# Call 2: Verify (must be separate call)
op('/project1/base1').cook(force=True)
result = op('/project1/base1').errors(recurse=True)
```

If you check errors in the same call as the fix, you'll see stale cached errors.

### Print Layout

```python
# List all children sorted by position
for child in sorted(base.children, key=lambda c: (c.nodeX, c.nodeY)):
    print(f"{child.name}: ({child.nodeX}, {child.nodeY})")
```

### List Docked Operators

```python
for d in op('glslmat1').docked:
    print(f"{d.name}: {d.opType}")
```

---

## Saving Data

Use `.save()` method to export operator data to files.

### TOP → Image

```python
import tempfile, os

PREVIEW_PATH = os.path.join(tempfile.gettempdir(), 'td_preview.jpg')
op('/project1/render1').save(PREVIEW_PATH)

# Supported formats: .jpg, .png, .tiff, .exr, etc.
os.remove(PREVIEW_PATH)
```

### CHOP → .clip

```python
chop = op('/project1/noise1')
chop.save(project.folder + '/noise1.clip')
```

### DAT → .csv / .tsv

```python
dat = op('/project1/table1')
dat.save(project.folder + '/table1.csv')
```

### SOP → .obj

```python
sop = op('/project1/sphere1')
sop.save(project.folder + '/sphere1.obj')
```
