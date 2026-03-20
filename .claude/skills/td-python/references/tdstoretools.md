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
