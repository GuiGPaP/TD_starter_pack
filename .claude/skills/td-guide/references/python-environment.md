# Python Environment Reference

## Contents

1. [Runtime](#runtime)
2. [Auto-Imported Modules](#auto-imported-modules)
3. [Bundled Packages](#bundled-packages)
4. [TD Utility Modules](#td-utility-modules)
5. [Threading](#threading)
6. [subprocess Constraints](#subprocess-constraints)

---

## Runtime

TD ships **Python 3.11** as a custom embedded build. The `td` module is always available without import in scripts, expressions, and the textport.

Modify Python search path via:
- Edit > Preferences > "Add External Python to Search Path"
- `sys.path.insert()` in an Execute DAT `onStart()`
- `PYTHONPATH` environment variable

**Warning**: Loading different versions of NumPy or OpenCV is at your own risk — TD's internal tools and palette components depend on the bundled versions.

---

## Auto-Imported Modules

The `td` module auto-imports these standard modules (no explicit `import` needed in expressions):

`collections`, `enum`, `inspect`, `math`, `re`, `sys`, `traceback`, `warnings`

---

## Bundled Packages

Pre-installed (require explicit `import`):

| Package | Use |
|---------|-----|
| `numpy` | Scientific computing, array ops |
| `cv2` (OpenCV) | Computer vision, image processing |
| `yaml` (PyYAML) | YAML parsing |
| `requests` | HTTP client |
| `jsonschema` | JSON Schema validation |
| `cryptography` | Cryptographic primitives |

Install additional packages via a matching Python 3.11 system install + pip, then add its site-packages to TD's Python path.

---

## TD Utility Modules

Available via `import` or `mod`:

| Module | Purpose |
|--------|---------|
| `TDFunctions` | Advanced Python utilities |
| `TDJSON` | JSON tools |
| `TDStoreTools` | Storage and Dependency system (`StorageManager`, `DependDict`) |
| `TDResources` | System resources (pop-up menus, dialogs, mouse, **ThreadManager**) |

Access pattern: `mod.TDFunctions` or `import TDFunctions`.

---

## Threading

### Critical Rule

**Never access TD objects (OPs, COMPs, Parameters) from a secondary thread** — not for reading, writing, or any operation. This causes crashes or undefined behavior.

### ThreadManager (2023.31500+)

Worker pool wrapping Python 3.11 threading. Access: `op.TDResources.ThreadManager`

| Config | Default | Notes |
|--------|---------|-------|
| Number Of Workers | 4 | Active worker threads |
| Max Number Of Workers | CPU count | Pool cap |
| Queue Max Size | 0 | 0 = unlimited |
| Strategy on max reached | Queue | Queue / Except / Create |

### ThreadManagerClient (Palette)

Simplified callback-based wrapper. Create from Palette > ThreadManager. Callbacks generate TDTasks submitted to the ThreadManager queue.

### ThreadsMonitor (Palette)

Live debugging UI — tracks active threads, queued tasks, workload. Access built-in logger via "Open Logger".

### Safe Pattern for Thread Results

Use an Execute DAT frame callback to dequeue results from the thread:

```python
# In the threaded function — no TD access
def my_task():
    result = expensive_computation()
    return result  # returned via TDTask

# In Execute DAT onFrameStart — safe TD access
def onFrameStart(frame):
    # Check thread results and update TD operators here
    pass
```

---

## subprocess Constraints

- `subprocess.run()` / `Popen()` work normally for launching external tools (ruff, pyright, etc.)
- `Popen` does **not** support file-like objects for stdin/stdout/stderr — use `capture_output=True` or `PIPE` instead
- External processes are isolated from TD's Python — no stability risk to TD
