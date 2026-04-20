# TDFunctions Reference

## Contents

1. [Path Helpers](#path-helpers)
2. [Property Creation](#property-creation)
3. [Parameter Utilities](#parameter-utilities)
4. [Layout](#layout)
5. [Menu Helpers](#menu-helpers)
6. [tScript Bridge](#tscript-bridge)

---

## Path Helpers

| Function | Returns | Notes |
|---|---|---|
| `getShortcutPath(shortcut, default=None)` | str or None | Best-guess resolution — **always validate** the returned path with `op()` |
| `parentLevel(op, depth)` | OP or None | Returns the ancestor OP at `depth` levels up, **not** the depth itself |

```python
# Good — validate the result
path = TDFunctions.getShortcutPath('MOPs')
target = op(path) if path else None
if target is None:
    debug('shortcut not found')

# Bad — assumes it exists
target = op(TDFunctions.getShortcutPath('MOPs'))  # TypeError if None
```

## Property Creation

**`createProperty(ext, name, value=None, readOnly=False, dependable=False)`**

Adds a Python property to `type(ext)` — the **class**, not the instance.

```python
# Bad — creates class-level property, shared across all instances
TDFunctions.createProperty(self, 'Count', 0)
# Now ALL instances of this extension class share the same property descriptor

# Good — use instance storage instead when replication is involved
me.store['Count'] = 0
```

**`makeDeepDependable(ext, name)`** — wraps an existing property's value in DependDict/DependList recursively. Only use when downstream operators must cook on nested changes.

## Parameter Utilities

| Function | Returns | Notes |
|---|---|---|
| `applyParInfo(comp, parInfo)` | list[str] | Names of params that **failed** — empty list = success |
| `getParInfo(comp, pattern='*')` | dict | Serializable dict of parameter values |
| `bindChain(par)` | list[Par] | Full chain of bound parameters from source to final |

```python
# Good — check return value
failed = TDFunctions.applyParInfo(comp, info)
if failed:
    debug(f'Failed to apply: {failed}')

# Bad — ignores failures silently
TDFunctions.applyParInfo(comp, info)  # typos in param names vanish
```

## Layout

| Function | Returns | Notes |
|---|---|---|
| `findNetworkEdges(comp)` | dict | `{'left': x, 'right': x, 'top': y, 'bottom': y}` of child node bounds |
| `arrangeNode(node, position='end')` | None | Positions a node relative to siblings |

## Menu Helpers

**`parMenu(menuNames, menuLabels=None)`** — returns a dict suitable for `par.menuNames`/`par.menuLabels`. Convenience only — same as building the lists manually.

## tScript Bridge

**`tScript(cmd)`** — executes a tscript command by creating a temporary textDAT, running the command, reading stdout, and deleting the DAT.

```python
# Bad — slow in a loop
for i in range(100):
    result = TDFunctions.tScript(f'opfind -n /project1 -t chopexecDAT')

# Good — use Python API instead
results = op('/project1').findChildren(type=chopexecDAT)
```

**Rule of thumb:** if the Python API can do it, never use `tScript()`.
