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

### Self-Scheduling DAT Loop Pattern

For per-frame callbacks (flush queues, polling), use a textDAT that reschedules itself via `run(delayFrames=1)` at module level:

```python
# poll_script textDAT content
import time as _time

def tick():
    try:
        ext = getattr(op('/myComp').ext, 'MyExt', None)
        if not ext:
            return  # Stop loop — no reschedule
        ext.on_tick()
    except Exception as e:
        print(f'tick error: {e}')
        return  # Stop loop on error
    # Only reschedule on success
    run('op("/myComp/poll_script").module.tick()', delayFrames=1)

# Auto-start on module load
run('op("/myComp/poll_script").module.tick()', delayFrames=1)
```

**Key rules:**
- Auto-start via module-level `run(delayFrames=1)` — NOT `tick()` directly (calling `tick()` during extension `__init__` is unreliable — TD may not process `run()` scheduled during init)
- `getattr(comp.ext, 'Name', None)` — never bare `.ext.Name` (throws `AttributeError` if ext is unloaded → spam every frame)
- `return` without rescheduling on error or missing ext → loop dies gracefully
- `_ensure_poll_script` must NOT rewrite text if unchanged (rewriting resets the module → duplicate loops)

**WARNING:** `textDAT.run()` is NOT the same as the global `run()`. `textDAT.run()` executes the **DAT's own text content** as a script — it does NOT execute an arbitrary string argument. To schedule code from an extension, use the module-level auto-start pattern above.

### Extension Reinit & TD Persistence

When `__init__` runs (project save/load, extension toggle), the Python instance is fresh (`self._state = {}`) but **TD operators persist** (COMPs, DATs, TOPs created by previous init). Always guard against duplicates:

```python
# BAD — creates duplicates on reinit
comp = parent.create("baseCOMP", "myComp")

# GOOD — reuse existing
comp = parent.op("myComp")
if not comp:
    comp = parent.create("baseCOMP", "myComp")
```

This also applies to text DATs written by the extension (poll scripts, callback scripts). Check existence and content before overwriting:

```python
def _ensure_script(self):
    ps = self.ownerComp.op("my_script")
    created = False
    if not ps:
        ps = self.ownerComp.create("textDAT", "my_script")
        created = True
    if created or ps.text.strip() != self._SCRIPT.strip():
        ps.text = self._SCRIPT  # Triggers module recompile + auto-start
```

### Module Reload in TD

`importlib.reload()` updates `sys.modules` but does **NOT** update a textDAT's `.module` cache. The textDAT keeps its stale compiled module. To force a textDAT to re-import from updated code on disk:

```python
ext_dat = op('/myComp/my_ext_dat')
old = ext_dat.text
ext_dat.text = old + '\n'  # Toggle forces recompile
ext_dat.text = old
```

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

## MCP `execute_python_script` and the Cook Loop

MCP's `execute_python_script` runs Python inside TD's interpreter but does **not** trigger a cook cycle. This has consequences for async patterns:

### Deferred callbacks don't flush during MCP calls

Extensions that use `_enqueue_task()` with daemon threads + `_run_on_main()` schedule callbacks via a deferred queue that flushes once per frame in the cook loop (via `poll_script`). An MCP call that enqueues work and immediately reads the result will see stale state — the callback hasn't run yet.

```python
# BAD — result not available in same MCP call
ext._up()           # enqueues compose_up on daemon thread
ext.PollStatus()    # enqueues compose_ps on daemon thread
comp.par.State.val  # still "created" — callbacks haven't flushed
```

### par.pulse() fires between separate MCP calls

A `par.X.pulse()` triggers the `parameterexecuteDAT` callback, which is frame-delayed. However, it **does fire** between two separate MCP `execute_python_script` calls (TD processes at least one frame between HTTP request/response cycles).

```python
# Call 1:
comp.par.Stop.pulse()   # parexecDAT queued for next frame

# Call 2 (separate MCP request):
comp.par.State.val      # "exited" — parexecDAT fired between calls
```

### `_sync_mode` for deterministic testing

Extensions that use `_enqueue_task()` can expose a `_sync_mode` flag that forces inline execution (no thread, no deferred queue). This makes the entire async chain deterministic:

```python
ext._sync_mode = True
comp.par.Stop.pulse()   # parexecDAT → onParPulse → _stop()
                        # → _enqueue_task runs inline
                        # → PollStatus runs inline
comp.par.State.val      # "exited" — available immediately
```

Always restore `_sync_mode = False` in a `finally` block. Never set in production.

### Popen.wait() deadlock with PIPE

`Popen.wait()` with `stdout=PIPE` / `stderr=PIPE` deadlocks when output exceeds the pipe buffer (~4KB). Use `communicate()` instead — it reads pipes while waiting:

```python
# BAD — deadlocks when output > 4KB
proc = subprocess.Popen(cmd, stdout=PIPE, stderr=PIPE)
proc.wait(timeout=60)
stdout = proc.stdout.read()  # never reached

# GOOD — reads pipes concurrently with wait
proc = subprocess.Popen(cmd, stdout=PIPE, stderr=PIPE)
stdout, stderr = proc.communicate(timeout=60)
```

This applies to both threaded (daemon) and inline (`_sync_mode`) contexts.

---

## subprocess Constraints

- `subprocess.run()` / `Popen()` work normally for launching external tools (ruff, pyright, etc.)
- `Popen` does **not** support file-like objects for stdin/stdout/stderr — use `capture_output=True` or `PIPE` instead
- **Always use `communicate()`** over `wait()` + deferred read when capturing output — prevents pipe buffer deadlocks
- External processes are isolated from TD's Python — no stability risk to TD
