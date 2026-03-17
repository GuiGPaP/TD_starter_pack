# Geometry COMP Reference

## Contents

1. [Geometry COMP Pattern](#geometry-comp-pattern-sop-and-pop)
2. [Setup Pattern](#setup-pattern-full-example)
3. [DO NOT: Common Mistakes](#do-not-common-mistakes-to-avoid)
4. [Correct Pattern](#correct-pattern)
5. [Instancing](#instancing)

---

## Geometry COMP Pattern (SOP and POP)

```python
base = op('/project1/base1')

# Create Geometry COMP, remove default torus, set up In/Out
geo = base.create(geometryCOMP, 'geo1')
geo.viewer = True
geo.nodeX = 400
geo.nodeY = 0

# Remove default torus
for child in geo.children:
    child.destroy()

# Create In/Out SOP (or inPOP/outPOP for POP family)
in_sop = geo.create(inSOP, 'in1')
in_sop.viewer = True
out_sop = geo.create(outSOP, 'out1')
out_sop.viewer = True
out_sop.display = True
out_sop.render = True
out_sop.inputConnectors[0].connect(in_sop)

# Connect external SOP to Geometry COMP input
geo.inputConnectors[0].connect(external_sop)
```

For POP family, replace `inSOP`/`outSOP` with `inPOP`/`outPOP`.

---

## Setup Pattern (Full Example)

```python
base = op('/project1/base1')

# 1. Create shape at parent level
box = base.create(boxPOP, 'box1')
box.viewer = True

null_box = base.create(nullPOP, 'null_box')
null_box.viewer = True
null_box.nodeX = 200
null_box.inputConnectors[0].connect(box)

# 2. Create Geometry COMP with In/Out
geo = base.create(geometryCOMP, 'geo1')
geo.viewer = True
geo.nodeX = 400
for child in geo.children:
    child.destroy()
in_pop = geo.create(inPOP, 'in1')
in_pop.viewer = True
out_pop = geo.create(outPOP, 'out1')
out_pop.viewer = True
out_pop.display = True
out_pop.render = True
out_pop.inputConnectors[0].connect(in_pop)

# 3. Connect
geo.inputConnectors[0].connect(null_box)
```

---

## DO NOT: Common Mistakes to Avoid

**These patterns cause debugging nightmares. NEVER do these.**

### DO NOT: Create geometry inside Geometry COMP

```python
# BAD - Don't do this!
box = geo.create(boxPOP, 'box1')  # WRONG!
```

**Why it's bad**: Can't see what's happening without entering COMP. Network structure becomes unclear from parent level.

### DO NOT: Reference parent operators from inside Geometry COMP

```python
# BAD - Don't do this!
# Inside geo1:
choptopop1.par.chop = '../null1'  # WRONG!
```

**Why it's bad**: Creates hidden dependencies. Harder to trace data flow.

---

## Correct Pattern

**Solution**: Prepare shapes at parent level, pass via In/Out, use relative paths.

```python
base = op('/project1/base1')

# GOOD: shape at parent level
box = base.create(boxPOP, 'box1')
box.viewer = True
null_box = base.create(nullPOP, 'null_box')
null_box.viewer = True
null_box.nodeX = 200
null_box.inputConnectors[0].connect(box)

# Geometry COMP receives data via input
geo.inputConnectors[0].connect(null_box)
geo.par.instanceop = 'null_chop'  # Relative path
```

---

## Instancing

Geometry COMP supports instancing to render multiple copies efficiently. The `instanceop` parameter accepts various OP types: **CHOP, SOP, POP, TOP, DAT**.

### Basic Example (CHOP)

```python
base = op('/project1/base1')

# 1. Create points → Null SOP → SOP to CHOP
sop2chop = base.create(soptoCHOP, 'sopto1')
sop2chop.viewer = True
sop2chop.par.sop = 'null1'

# 2. Enable instancing on Geometry COMP
geo.par.instancing = True  # Don't forget!
geo.par.instanceop = 'sopto1'
geo.par.instancetx = 'tx'
geo.par.instancety = 'ty'
geo.par.instancetz = 'tz'
```

### Instance Attribute Names by OP Type

| OP Type | Attribute Names | Notes |
|---------|-----------------|-------|
| **CHOP** | Channel names: `tx`, `ty`, `tz`, etc. | Most common pattern |
| **SOP** | `P(0)`, `P(1)`, `P(2)` for position | Point attributes |
| **POP** | `P(0)`, `P(1)`, `P(2)` for position | Same as SOP |
| **DAT** | First row values (column headers) | e.g., `tx`, `ty`, `tz` in first row |
| **TOP** | `r`, `g`, `b`, `a` for RGBA channels | Each pixel = one instance |

### Examples by OP Type

```python
# CHOP: use channel names
geo.par.instanceop = 'noise_chop'
geo.par.instancetx = 'tx'

# SOP/POP: use P(n) for position
geo.par.instanceop = 'grid_sop'
geo.par.instancetx = 'P(0)'
geo.par.instancety = 'P(1)'
geo.par.instancetz = 'P(2)'

# DAT: use column header names from first row
geo.par.instanceop = 'table_dat'
geo.par.instancetx = 'tx'

# TOP: use r/g/b/a for color channels
geo.par.instanceop = 'noise_top'
geo.par.instancetx = 'r'
geo.par.instancety = 'g'
geo.par.instancetz = 'b'
```

### Mixed Data Sources

```python
geo.par.instanceop = 'pos_chop'      # Position from CHOP
geo.par.instancetx = 'tx'
geo.par.instancecolorop = 'color_top' # Color from TOP
geo.par.instancecolorr = 'r'
```

**Common mistake**: Forgetting to set `geo.par.instancing = True`
