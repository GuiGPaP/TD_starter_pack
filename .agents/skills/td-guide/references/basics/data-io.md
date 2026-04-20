# Data Access and I/O

Read operator data and save operators to files.

```python
# CHOP data access
chop = op('sopto1')
chop.numSamples
chop.chan('tx')[0]      # Single value
chop.chan('tx').vals    # All values

# DAT data access
dat = op('text1')
dat.text                # Full text
dat.text = 'new'        # Set text
dat[0, 0].val           # Cell value
```

## Pattern Matching

Many TD parameters accept wildcards for matching multiple operators, channels, etc.

| Pattern | Matches |
|---------|---------|
| `*` | Any string (including empty) |
| `?` | Any single character |
| `[xyz]` | Any character in brackets |
| `^name` | Exclude (after other patterns) |

```python
# Render TOP patterns
render.par.geometry = 'geo*'           # All geo1, geo2, geo3...
render.par.lights = 'light*'           # All lights
render.par.geometry = 'geo* ^geo7'     # All geo* except geo7

# Find operators
ops('null*')                           # All nulls

# Find parameters
op('geo1').pars('t?')                  # tx, ty, tz
op('geo1').pars('t?', 'r?', 's?')      # translate/rotate/scale
```

## Saving Data

Use `.save()` to export operator data to files.

### TOP -> Image

```python
import tempfile, os
PREVIEW_PATH = os.path.join(tempfile.gettempdir(), 'td_preview.jpg')
op('/project1/render1').save(PREVIEW_PATH)
# Supported: .jpg, .png, .tiff, .exr
```

### CHOP -> .clip

```python
op('/project1/noise1').save(project.folder + '/noise1.clip')
```

### DAT -> .csv / .tsv

```python
op('/project1/table1').save(project.folder + '/table1.csv')
```

### SOP -> .obj

```python
op('/project1/sphere1').save(project.folder + '/sphere1.obj')
```
