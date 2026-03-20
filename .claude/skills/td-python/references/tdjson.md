# TDJSON Reference

## Contents

1. [Parsing](#parsing)
2. [Serialization](#serialization)
3. [Parameter Round-Trip](#parameter-round-trip)
4. [Flag Matrix](#flag-matrix)

---

## Parsing

**`textToJSON(text, orderedDict=False)`** — parses a JSON string. Returns `dict` or `None`.

**`datToJSON(dat, orderedDict=False)`** — parses a DAT's text content. Returns `dict` or `None`.

Both return **None on failure** (malformed JSON, empty text) — they print to textport but do NOT raise.

```python
# Good — always null-check
data = TDJSON.textToJSON(op('config').text)
if data is None:
    debug('Failed to parse config JSON')
    return

# Bad — crashes downstream
data = TDJSON.textToJSON(op('config').text)
count = data['count']  # TypeError: 'NoneType' is not subscriptable
```

## Serialization

**`serializeTDData(data)`** — recursively converts TD types to JSON-safe values.

| TD Type | Serialized As |
|---|---|
| `Par` | `par.eval()` |
| `Cell` | `cell.val` |
| `Channel` | `channel.eval()` |
| `OP` | `op.path` (string) |
| `tdu.Position` | `[x, y, z]` |
| `tdu.Vector` | `[x, y, z]` |
| `tdu.Color` | `[r, g, b, a]` |
| `tdu.Matrix` | nested list (4x4) |
| `dict` / `list` | recurse into values |

```python
# Good — serialize mixed TD data
info = {'pos': op('/geo1').par.tx, 'source': op('/null1')}
safe = TDJSON.serializeTDData(info)
# {'pos': 0.5, 'source': '/project1/null1'}

# Bad — json.dumps on TD objects
import json
json.dumps(info)  # TypeError: Object of type Par is not JSON serializable
```

## Parameter Round-Trip

**Export:** `parameterToJSONPar(par)` — returns a dict describing one parameter (name, type, default, range, menu items, etc.).

**Import:** `addParameterFromJSONDict(comp, parDict, setValues=True, page=None)` — creates or updates a custom parameter from the dict produced by `parameterToJSONPar`.

```python
# Round-trip a custom parameter
par_dict = TDJSON.parameterToJSONPar(op('/base1').par.Mypar)
TDJSON.addParameterFromJSONDict(op('/base2'), par_dict, page='Custom')
```

## Flag Matrix

Flags for `COMP.loadChildrenFromJSONDict(jsonDict, **flags)`:

| Flag | Default | Effect if True |
|---|---|---|
| `replace` | `True` | Existing children with same name are replaced |
| `setValues` | `True` | Parameter values from dict are applied |
| `destroyOthers` | `False` | Children **not** in dict are **deleted** |
| `newAtEnd` | `False` | New operators placed at end of network |
| `fixParNames` | `False` | Auto-fix parameter name conflicts |
| `setBuiltIns` | `False` | Apply built-in parameter values (nodeX, nodeY, etc.) |

```python
# Good — explicit about destructive flag
comp.loadChildrenFromJSONDict(data, destroyOthers=False)

# Dangerous — wipes all children not in data
comp.loadChildrenFromJSONDict(data, destroyOthers=True)
# Only use when you want an exact match between dict and COMP contents
```

**Safe default pattern:**
```python
comp.loadChildrenFromJSONDict(
    data,
    replace=True,      # update existing
    setValues=True,     # apply param values
    destroyOthers=False # keep children not in dict
)
```
