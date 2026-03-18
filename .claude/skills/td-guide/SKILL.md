---
name: td-guide
description: "TouchDesigner network creation, operator layout, rendering, data conversion. Use when working with TD networks, operators, components, or need TD Python API guidance."
---

# TouchDesigner Guide

Use this skill when creating, modifying, or debugging TouchDesigner networks via the MCP API.

---

## CRITICAL: Your Prior Knowledge is Unreliable

TouchDesigner is a visual programming environment. **Your pre-trained knowledge about TD is very likely incorrect.**

**Assume your memory is completely unreliable.** Always gather accurate information first:
- This document and reference files
- Context7 for official TD API documentation
- The project's MCP API (see `reference/project-api.md`)

### Before Starting ANY Task

**Output "Gathering information first" and collect reliable information before implementation.**

1. Read all `.md` files in `reference/` (REQUIRED for all tasks)
2. Verify parameter names using the MCP API or `[p.name for p in op('/path').pars()]`
3. Ask yourself: "Do I have sufficient reliable information to proceed?"
4. Only if yes, start implementation

---

## REQUIRED: Read All Reference Files First

**You MUST read all `.md` files in `reference/` before any implementation.**

These files contain essential patterns for operator creation, layout, error handling, and best practices.

---

## MCP Runtime: `execute_python_script` Namespace

When running Python via the MCP `execute_python_script` tool, the namespace provides:
- `op` — `td.op` (callable: `op('/project1/base1')`)
- `ops` — `td.ops`
- `td` — the `td` module
- `project` — `td.project`
- **`parent`** — **a string path** (e.g., `"/project1"`), NOT an OP object

**CRITICAL:** `parent.create(...)` will crash. Always resolve to an OP first:

```python
base = op('/project1/base1')  # ← OP object, supports .create()
```

---

## Operator Creation — via execute_python_script

### Create Operators

```python
base = op('/project1/base1')

# Create an operator — use create_td_node MCP tool for simple cases,
# or execute_python_script when you need viewer/layout control:
new_op = base.create(gridSOP, 'grid1')
new_op.viewer = True
```

**Positioning:** For operators without docked DATs (most SOPs, CHOPs, etc.), direct assignment is fine:

```python
new_op.nodeX = 0
new_op.nodeY = 0
```

**For GLSL TOP/MAT** (which have docked DATs like `_pixel`, `_vertex`), move the main op and its docked children together:

```python
def move_with_docked(target, x, y):
    dx, dy = x - target.nodeX, y - target.nodeY
    target.nodeX, target.nodeY = x, y
    for d in target.docked:
        d.nodeX += dx
        d.nodeY += dy

move_with_docked(glsl_op, 400, 0)
```

### Connect Operators

```python
op('noise1').inputConnectors[0].connect(op('sphere1'))
```

### Chain and Layout

```python
base = op('/project1/base1')
ops_list = [base.op('grid1'), base.op('noise1'), base.op('null1')]
for i in range(1, len(ops_list)):
    ops_list[i].inputConnectors[0].connect(ops_list[i-1])
    ops_list[i].nodeX = ops_list[i-1].nodeX + 200
    ops_list[i].nodeY = ops_list[i-1].nodeY
```

### Check Errors

```python
err = op('/project1/base1').errors(recurse=True)
print(err)
```

**IMPORTANT: Error Cache Timing**

TD updates error state on frame boundaries. When fixing errors via MCP:
1. Fix in one `execute_python_script` call
2. Check errors in a **separate** `execute_python_script` call

### Verify Parameters Before Setting

```python
# TD parameter names are unpredictable (e.g., radius vs radx/rady/radz)
# ALWAYS check first:
params = [p.name for p in op('sphere1').pars() if 'rad' in p.name.lower()]
print(params)  # ['radx', 'rady', 'radz']
```

---

## Geometry COMP Pattern

```python
base = op('/project1/base1')

# Create Geometry COMP, remove default torus, add In/Out
geo = base.create(geometryCOMP, 'geo1')
geo.viewer = True
for child in geo.children:
    child.destroy()

in_sop = geo.create(inSOP, 'in1')
in_sop.viewer = True
out_sop = geo.create(outSOP, 'out1')
out_sop.viewer = True
out_sop.display = True
out_sop.render = True
out_sop.inputConnectors[0].connect(in_sop)

# Connect external SOP to Geometry COMP input
geo.inputConnectors[0].connect(base.op('null1'))
```

**Rules:**
- Create shapes at **parent level**, pass via In/Out — don't create geometry inside the COMP
- Don't reference parent operators from inside with `../` — use In/Out instead

---

## Reference Files

| When working on... | Read... |
|-------------------|------------------|
| **ALL tasks** | **`reference/basics.md`** (REQUIRED) |
| Operator families, data conversion | `reference/operator-families.md` |
| Geometry COMP, Instancing | `reference/geometry-comp.md` |
| Rendering, Camera, Light | `reference/rendering.md` |
| GLSL overview + skill routing | `reference/glsl.md` |
| Feedback loops, simulations | `reference/operator-tips.md` |
| MCP API endpoints | `reference/project-api.md` |

---

## Python Helpers

Common layout and network patterns are available as importable helpers:

```python
from td_helpers.layout import move_with_docked, chain_ops, get_bounds, place_below
from td_helpers.network import setup_geometry_comp, setup_feedback_loop, setup_instancing
```

These work in `execute_python_script` (modules/ is on `sys.path`). See inline snippets below for the patterns they encapsulate.

---

## GLSL Skills

For GLSL shader work, use the specialized skills:

| Task | Skill |
|------|-------|
| Pixel shader / GLSL TOP / 2D image effects | **td-glsl** |
| Vertex shader / GLSL MAT / 3D materials / displacement | **td-glsl-vertex** |
| Compute shader / particles / GLSL POP / SSBOs | **td-pops** |

---

## Before Implementation

**Consider multiple approaches before coding.**

1. List 2-3 different ways to achieve the goal
2. Evaluate each approach's pros and cons:
   - Simplicity (fewer conversions, family unity)
   - Performance (GPU vs CPU, data flow efficiency)
   - Extensibility (easy to modify later)
   - Readability (network clarity)
3. Choose the most effective approach based on the evaluation

## Required Rules

1. **Always set `viewer = True`** after creating operators (matches UI default)
2. **Always check errors** after complex operations: `op('/path').errors(recurse=True)`
3. **Use Null as intermediary** before any reference connection
4. **Verify layout before creating** to avoid overlapping operators
5. **Use relative paths** for references to nearby operators (same level or close hierarchy)
6. **Geometry COMP: create shapes at parent level** — Don't create geometry inside COMP; prepare at parent and pass via In/Out

---

## Operator Families (Quick Reference)

| Family | Purpose | Data Type |
|--------|---------|-----------|
| **SOP** | Surface/Geometry | 3D geometry (CPU) |
| **POP** | Point/Particle | 3D points (GPU) |
| **TOP** | Texture | 2D images |
| **CHOP** | Channel | Time-based data |
| **DAT** | Data | Tables, text |
| **COMP** | Component | Containers, scenes |

For detailed family info, operator lists, and cross-family patterns, see `reference/operator-families.md`.

---

## Skill Maintenance

When the user provides feedback about this skill (corrections, improvements, missing patterns, etc.):

1. Propose updates to the relevant `.md` files in this skill
2. Show the user the proposed changes before applying
3. Update `SKILL.md` or `reference/*.md` as appropriate
