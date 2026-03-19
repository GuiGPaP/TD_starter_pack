# TD Python Patterns

TouchDesigner Python runs inside a live operator graph. Code in DATs is not standalone Python — it executes in a context with injected globals and fixed callback signatures.

## Import Conventions

Standard TD Python file header:

```python
# Script DAT — typically no explicit imports needed
# op, me, parent(), tdu, ext are injected by TD

# If using TD storage utilities:
from TDStoreTools import StorageManager  # noqa: F401

# If using TD standard library:
from TDStd import *  # noqa: F403, F401

# Standard library imports come after TD imports:
import json
import re
```

Key points:
- `import td` is only needed in code that runs **outside** TD (e.g., MCP server modules). Inside DATs, `td` is implicit.
- `from TDStoreTools import *` and `from TDStd import *` are idiomatic TD — suppress the star-import warnings.
- TD does not use virtual environments for DAT code. There are no third-party packages.

## The `op()` Pattern

`op()` is the primary navigation function. It resolves operator paths to node references:

```python
# Absolute path
noise = op('/project1/noise1')

# Relative to current operator
sibling = op('table1')

# Relative to parent
other = op('../other_comp/script1')

# Shorthand for parameters
val = op('constant1').par.value0.eval()
```

`op()` returns `None` if the path doesn't resolve — always check before accessing properties in production code.

## Callback Signatures

TD calls Python functions with fixed signatures. The parameter names are conventions — **unused arguments are expected**:

```python
# Script DAT callbacks
def onCook(dat):
    """Called every frame when the DAT cooks."""
    pass

def onPulse(par):
    """Called when a pulse parameter is triggered."""
    pass

# Panel callbacks
def onSelect(panelValue):
    pass

def onRollover(panelValue):
    pass

# CHOP Execute callbacks
def onValueChange(channel, sampleIndex, val, prev):
    """All four params are mandatory even if unused."""
    pass

def onOnToOff(channel, sampleIndex, val, prev):
    pass
```

Ruff's `ARG001` (unused argument) fires on nearly every callback. The project suppresses this in `modules/td_helpers/*` but DAT text doesn't get that exemption — note it as a TD false positive.

## Expression Mode

Some DATs run in expression mode — a single Python expression evaluated per cell or per cook:

```python
# Expression mode examples (single-line, no def/class):
me.time.frame
op('noise1')[0, 0].val
tdu.clamp(op('slider1').par.value0, 0, 1)
```

These produce unusual ruff output because they're expressions, not statements. Treat them as-is.

## COMP Extensions

Extensions are Python classes attached to COMPs. They follow a specific pattern:

```python
class MyExtension:
    def __init__(self, ownerComp):
        self.ownerComp = ownerComp

    # Public methods (accessible via ext.MyExtension.Method)
    def DoSomething(self, value):
        target = op('null1')
        target.par.value0 = value

    # Private methods (convention: lowercase or underscore prefix)
    def _helper(self):
        pass
```

Extension method names are PascalCase by TD convention — ruff's naming rules (`N801`, `N802`) are not in the active ruleset but would conflict if added.

## Common Patterns That Confuse Ruff

| Pattern | Why it looks wrong to ruff | What to do |
|---|---|---|
| `me.fetch('key', default)` | `me` is F821 | Suppress, it's a TD global |
| `op('path').cook(force=True)` | `op` is F821 | Suppress, it's a TD global |
| `parent().par.Custompar` | `parent` is F821 | Suppress, it's a TD global |
| `mod.module_name.function()` | `mod` is F821 | Suppress, it's a TD global |
| `run("op('x').cook()", delayFrames=1)` | S307 (eval-like) | Review — `run()` is TD's deferred execution, not arbitrary eval |
| `tdu.clamp(val, 0, 1)` | `tdu` is F821 | Suppress, it's a TD utility module |
