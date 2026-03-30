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

### ThreadManager Caveats

**`SuccessHook` / `ExceptHook` callbacks may not fire reliably.** In practice, TDTask callbacks were observed to never execute despite tasks completing successfully. The cause is unclear — may require a subscriber or specific PostProcess setup. **Prefer the non-blocking pattern below.**

### Non-blocking Subprocess Pattern (Recommended)

Use `threading.Thread(daemon=True)` for blocking calls + `run(delayFrames=1)` for main-thread polling:

```python
import threading

class MyExt:
    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self._thread_result = None
        self._thread_error = None

    def start_async(self):
        self._thread_result = None
        self._thread_error = None
        t = threading.Thread(target=self._blocking_work, daemon=True)
        t.start()
        run(f"op('{self.ownerComp.path}').ext.MyExt._poll()", delayFrames=1)

    def _blocking_work(self):
        """Background thread — NO TD ops allowed here."""
        try:
            import subprocess
            r = subprocess.run(['docker', 'info'], capture_output=True, timeout=10)
            self._thread_result = {'ok': r.returncode == 0}
        except Exception as e:
            self._thread_error = str(e)

    def _poll(self):
        """Main thread — polls for background thread completion."""
        if self._thread_error:
            self.ownerComp.par.Status.val = f'Error: {self._thread_error}'
            return
        if self._thread_result is None:
            # Still running — poll again next frame
            run(f"op('{self.ownerComp.path}').ext.MyExt._poll()", delayFrames=1)
            return
        # Done — safe to use TD ops
        self.ownerComp.par.Status.val = 'Done'
```

**Key rules:**
- Background thread: no `op()`, no `par.`, no TD objects
- Communicate via instance attributes (`self._result`)
- `run(delayFrames=1)` polls each frame (~0 cost)
- Result handling on main thread: full TD access

---

## Performance Profiling

### Perform CHOP

28 channels available (enable via toggle parameters): `fps`, `msec`, `cpumsec`, `cook`, `dropped_frames`, `gpu_mem_used`, `cpu_mem_used`, `cookrate`, `gpu0_chip_temp`, `active_expressions`, etc.

**Tip:** Connect a Trail CHOP (5s window) after Perform CHOP for time-series visualization of FPS drops.

### Per-Operator Metrics (Python)

| Attribute | Type | Notes |
|-----------|------|-------|
| `op.cpuCookTime` | float | **Cumulative** since creation — NOT per-frame |
| `op.cookStartTime` | float | Offset from frame start (seconds) — per-frame |
| `op.cookEndTime` | float | Offset from frame end (seconds) — per-frame |
| `op.cookedThisFrame` | bool | Whether op cooked current frame |
| `op.gpuCookTime` | float | GPU cook time |
| `op.totalCooks` | int | Total cook count |
| `op.cpuMemory` | int | CPU memory (bytes) |
| `op.gpuMemory` | int | GPU memory (bytes) |
| `comp.childrenCPUCookTime` | float | Aggregate children CPU time |

**Per-frame cost** = `cookEndTime - cookStartTime` (only when `cookedThisFrame` is True).

### MCP Tool

`get_performance(scope="/path", topN=20)` — returns global metrics + per-operator profiling sorted by frame cost.

---

## subprocess Constraints

- `subprocess.run()` / `Popen()` work normally for launching external tools (ruff, pyright, etc.)
- `Popen` does **not** support file-like objects for stdin/stdout/stderr — use `capture_output=True` or `PIPE` instead
- External processes are isolated from TD's Python — no stability risk to TD
