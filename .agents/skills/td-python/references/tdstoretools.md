# TDStoreTools Reference

## Contents

1. [StorageManager](#storagemanager)
2. [When to Use What](#when-to-use-what)
3. [DependDict / DependList / DependSet](#dependdict--dependlist--dependset)

---

## StorageManager

Manages `me.store` entries for a COMP extension — keeps storage in sync with a declared schema.

### Constructor

```python
# In an extension's __init__:
stored_items = [
    {'name': 'Data', 'default': {}, 'property': True, 'readOnly': False},
    {'name': 'Active', 'default': False, 'property': True, 'readOnly': False},
]
self.stored = TDStoreTools.StorageManager(self, comp, stored_items)
```

Each item dict supports: `name`, `default`, `property` (create Python property), `readOnly`, `dependable` (wrap in DependDict/List).

### Init vs Reinit

- **`StorageManager(ext, comp, items)`** — constructor, called once in `__init__`
- **Sync behavior with `sync=True`:** any `me.store` key NOT listed in `items` is **deleted**. Default is `sync=False` which preserves unknown keys.

### Class Name Collision

The internal storage key includes `type(ext).__name__`. Two different extensions with the same class name on the same COMP will **silently share/overwrite** storage.

```python
# Bad — both extensions named "Ext" on same COMP
class Ext:  # in script1
    def __init__(self, comp):
        self.stored = TDStoreTools.StorageManager(self, comp, [...])

class Ext:  # in script2 — same class name!
    def __init__(self, comp):
        self.stored = TDStoreTools.StorageManager(self, comp, [...])
# Storage keys collide — items overwrite each other

# Good — unique class names
class DataManager:
    ...
class UIController:
    ...
```

## When to Use What

| Need | Use | Why |
|---|---|---|
| Persistent data that survives reinit | `StorageManager` | Schema-driven, synced with extension lifecycle |
| Quick one-off storage | `me.store['key'] = val` / `me.fetch('key', default)` | No schema overhead |
| Downstream ops must react to changes | `DependDict` / `DependList` | Triggers cook on dependent readers |
| High-frequency data (every frame) | Plain `dict` / `list` | No dependency overhead |
| Data shared across COMPs | `op.TDResources` or project storage | StorageManager is COMP-local |

## DependDict / DependList / DependSet

Wrappers around standard Python containers that participate in TD's dependency system. When a reader accesses a value, it registers as dependent — any write triggers a cook on all readers.

### Key API

| Method | Description |
|---|---|
| `d['key']` / `d['key'] = val` | Standard access — registers/triggers dependency |
| `d.getRaw()` | Returns underlying plain dict/list **without** registering dependency |
| `d.getDependency(key)` | Returns the `tdu.Dependency` object for a specific key |
| `d.peekValue(key)` | Read without registering dependency |

### Restrictions

- **No nesting of DependDict inside DependDict** — inner changes won't trigger outer dependency. Use `makeDeepDependable()` from TDFunctions if you need nested reactivity.
- **Do not use in `onFrameStart`/`onCook` hot paths** unless downstream reactivity is the explicit goal — each read/write has overhead.

```python
# Good — downstream CHOP Execute reacts to changes
self.stored = TDStoreTools.StorageManager(self, comp, [
    {'name': 'Config', 'default': {}, 'dependable': True, 'property': True},
])

# Bad — DependDict in a per-frame callback with no downstream readers
def onFrameStart(self):
    self.Config['frame'] = absTime.frame  # triggers dependency every frame for nothing
```

## tdu.Dependency

Low-level dependency primitive. `DependDict` and `DependList` are built on top of this. Use `tdu.Dependency` directly when you need a single reactive value outside of StorageManager.

### Constructor

```python
dep = tdu.Dependency(val=None)
```

### Properties

| Property | Access | Description |
|----------|--------|-------------|
| `.val` | read/write | The stored value. **Reading** creates a dependency link (the reader will cook when value changes). **Writing** notifies all dependents. |
| `.peekVal` | read-only | Returns the value **without** creating a dependency. Use for logging, debugging, or non-reactive reads. |
| `.callbacks` | read/write | List of callables invoked when `.val` changes. Each receives `(dependency, setInfo)`. |
| `.ops` | read-only | List of operators currently dependent on this value. |
| `.listAttributes` | read-only | List of attribute names on operators that depend on this. |

### Methods

| Method | Description |
|--------|-------------|
| `.modified()` | Notify dependents after in-place mutation of a mutable value (list append, dict key change). Required because TD cannot detect sub-component changes. |
| `.setVal(val, setInfo=None)` | Set value with optional info dict passed to callbacks. |

### Critical pitfall: assignment overwrites the Dependency

```python
# BAD — replaces the Dependency object with a plain int
op('comp1').Scale = 5

# GOOD — sets the value inside the existing Dependency
op('comp1').Scale.val = 5
```

This applies to any storage key that was created as `dependable: True` in StorageManager. Direct assignment destroys the reactivity.

### Mutable object pitfall

```python
dep = tdu.Dependency([1, 2, 3])

# BAD — dependents NOT notified (list mutated in place)
dep.val.append(4)

# FIX — manually notify after in-place mutation
dep.val.append(4)
dep.modified()

# ALTERNATIVE — reassign entirely (triggers .val setter)
dep.val = dep.val + [4]
```

Same applies to dicts: `dep.val['key'] = 'new'` does not notify — call `dep.modified()` after.

### Callback pattern

```python
def on_scale_change(dependency, setInfo):
    print(f"Scale changed to {dependency.val}")

scale = tdu.Dependency(1.0)
scale.callbacks.append(on_scale_change)
scale.val = 2.0  # prints "Scale changed to 2.0"

# With setInfo for context
scale.setVal(3.0, setInfo={'source': 'slider'})
```

### When to use what

| Need | Use |
|------|-----|
| Single reactive value | `tdu.Dependency` |
| Reactive dict/list with multiple keys | `DependDict` / `DependList` |
| Reactive value managed by StorageManager | `dependable: True` in items list |
| Non-reactive data | Plain Python variable |
| Read without creating dependency | `.peekVal` (Dependency) or `.peekValue(key)` (DependDict) |
