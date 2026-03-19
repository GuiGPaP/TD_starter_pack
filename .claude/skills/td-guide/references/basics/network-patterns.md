# Network Design Patterns

Layout rules and structural patterns for clean, maintainable TD networks.

## The Null Intermediary Pattern

Before any reference connection, insert a Null operator. This decouples producers from consumers and makes networks modular.

```
grid1 -> null1 -> sopto1
render1 -> null_out
```

## Relative Paths Over Absolute

```python
# BAD — breaks when moving/copying network
geo.par.instanceop = '/project1/base1/null_chop'

# GOOD — use relative paths
geo.par.instanceop = 'null_chop'   # Same level
render.par.camera = '../cam1'      # Parent level
```

**When to use which:**
- Same level or nearby hierarchy -> **Relative** (`null1`, `../cam1`)
- Global/shared resources -> **Absolute** (`/project1/shared/texture1`)

## Layout Rules

- Data flows **left to right** (increasing X)
- COMP hierarchy flows **top to bottom**
- Check layout before creating to avoid overlap

### Spacing

| Direction | Spacing | Notes |
|-----------|---------|-------|
| X | 200+ | Horizontal chain |
| Y | 130+ | SOP/TOP/CHOP/DAT |
| Y | 160+ | COMP (larger) |

## The Type-Conversion Stack Pattern

When operator family changes (SOP -> CHOP), keep same X, stack vertically:

```
null1 (X=200, Y=-270) [SOP]
    |
sopto1 (X=200, Y=-145) [CHOP] -> null2 (X=400)
```

## Docked Operators

GLSL TOP/MAT and Script SOP create associated DATs. When positioning:

- Use `move_with_docked()` (see @operator-creation.md)
- `GetBounds` should account for docked operators
- Never set `nodeX`/`nodeY` directly on ops with docked children
