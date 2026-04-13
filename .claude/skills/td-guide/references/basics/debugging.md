# Debugging

Check errors, inspect layout, and diagnose operator issues.

## Network-Wide Error Scan

Use `scan_network_errors` to find all errors and warnings across a network subtree in one call:

```
scan_network_errors(scope="/project1", maxDepth=5, includeWarnings=true)
```

Returns a structured report with every operator that has errors or warnings. Use this first when diagnosing a broken network.

## Single-Node Error Check

For a specific node and its children:

```python
err = op('/project1/base1').errors(recurse=True)
print(err)
```

## The Frame-Boundary Rule

TD updates error state on frame boundaries. When fixing errors via MCP, always use two separate calls:

```python
# Call 1: Fix the error
const.par.value.expr = 'math.sin(absTime.seconds)'
```

```python
# Call 2: Verify (MUST be separate execute_python_script call)
op('/project1/base1').cook(force=True)
result = op('/project1/base1').errors(recurse=True)
```

If you check errors in the same call as the fix, you get stale cached errors.

## Print Layout

```python
for child in sorted(base.children, key=lambda c: (c.nodeX, c.nodeY)):
    print(f"{child.name}: ({child.nodeX}, {child.nodeY})")
```

## List Docked Operators

```python
for d in op('glslmat1').docked:
    print(f"{d.name}: {d.opType}")
```

## Search Parameters

```python
for p in op('glsl1').pars():
    if 'vec' in p.name.lower():
        print(f"{p.name}: {p.val}")
```

---

## Performance Monitoring Tools

### Info CHOP — Targeted Cook Monitoring

Connect an Info CHOP to any operator to get `cook time` and `total cooks` channels. Send to a Trail CHOP for time-series visualization.

> **Critical: enable Passive mode.** By default, the Info CHOP **forces the target operator to cook** (it's a cook request). Toggle the **Passive** parameter ON — it then only reports cook data when the operator was already going to cook. This is the correct way to monitor `total cooks` without distorting results.

### OP Find DAT — Performance Table

The OP Find DAT lists all operators under a component with performance columns: CPU time, GPU time, CPU memory, GPU memory, cook start/end time, etc.

- Filter by family (e.g., `Top Family` to see only TOPs)
- Sort by cook time to find the heaviest operators
- Sum columns for total cost of a network branch
- Default: requires a pulse to update. Set to "always" for live monitoring (adds overhead)

### Performance Monitor — Frame Trigger

Beyond basic timeline capture (Alt+Y), the Performance Monitor has a **Frame Trigger** mode:

- Enter a threshold in milliseconds (e.g., 18ms for a 60fps project where frames should be ~16ms)
- The monitor waits silently until a frame exceeds the threshold
- When a drop occurs, it captures a precise snapshot of everything that contributed to that slow frame

This is the ideal tool for **intermittent frame drops** that can't be reproduced on demand. Also supports wildcard filtering (e.g., `*movie*`, `noise*`) to isolate specific operators.

### Cook Bar (Community Tool)

Created by Anton (hexagons.se, available on GitHub). Displays small bars directly above each cooking operator, with a GPU memory usage bar at the bottom. Provides real-time performance feedback while working in the network. Delete it to remove.

---

## Troubleshooting & Crash Recovery

### CrashAutoSave

When TD crashes, it automatically saves the project state to `CrashAutoSave.yourproject.toe` in the same directory (or Documents/Derivative). This file captures the state just before the crash.

### Safe Mode

To bypass startup scripts that may cause crashes:
1. Rename the `.toe` file with the `CrashAutoSave.` prefix
2. Open TouchDesigner (launches empty)
3. Load the renamed file — TD treats it as a crash recovery and skips startup scripts

### Startup Error Dialog

Edit > Preferences > General > **Show Startup Errors** — controls whether an error dialog appears on project load. Set to "Errors" (skip warnings) or "Warnings" (show everything).

### Crash Investigation

- **WinDbg Preview** (Microsoft Store): open `.dmp` files from the crash folder for low-level stack traces
- **Task Manager**: right-click TD process > Create dump file — captures state for later analysis
- **macOS**: check `/Applications/Utilities/Console` for crash reports

### ToeExpand / ToeCollapse

Command-line tools that convert a binary `.toe` file into an ASCII-readable folder structure and back. Useful for:
- Debugging corrupt projects (inspect individual operators as text)
- Diffing project states
- Version control of TD projects

### Bug Reports to Derivative

Email `support@derivative.ca` or use the forums. Include: `.toe` file, reproduction steps, `.dmp` files. Trim the project to a minimal reproducible case. Use `.zip` format.

---

## Palette:probe — Visual Performance Monitor

Toggle with **Ctrl+P** (Cmd+P on macOS), or load from Palette > Monitor > probe.

### What it displays

- **CPU time** = stacked circles (10 most recent time slices, newest on top)
- **GPU time** = diamonds (same stacking)
- **COMPs** = donuts — inner ring = children cook time, outer ring = total including the node itself
- **Large colored box** at top = total cook time of all nodes in the current network
- **White line on spectrum** = current node's metric value relative to legend

### Data modes

Switch between: CPU time, GPU time, CPU memory (MB), GPU memory (MB), children count.

### Navigation

| Action | Effect |
|--------|--------|
| Left-click operator | Enter component (if COMP) |
| Click background | Go up one network level |
| Scroll wheel | Zoom in/out |
| Middle-click operator | Open parameter dialog |
| Right-click operator | Open in separate network editor |

### Key parameters

| Parameter | Purpose |
|-----------|---------|
| `cputime` / `gputime` | Data type selector |
| `performembed` | Embed in Perform Mode window |
| `performpos` (u/v) | Position in Perform window |
| `performscale` | Scale in Perform window |
| `opacity` | Transparency of the overlay |
| `renderres` (w/h) | Render resolution of the probe display |

### Performance note

Probe consumes minimal cook time (~few ms) when displayed — it appears as a visible block in its own visualization. Hiding it with Ctrl+P stops all Probe cooking entirely. **Remove or disable Probe when done diagnosing** — it adds overhead during normal operation. Only CPU set-up time is shown for TOP/panel GPU cooking (same limitation as Performance Monitor).

### SOP To DAT — Geometry Attribute Inspector

The SOP To DAT displays all geometry attributes (position, velocity, life, normals, drag, etc.) in a table — the equivalent of Houdini's Geometry Spreadsheet. Useful for debugging particle systems and custom attributes.

> **Disable its viewer when not in use** — displaying a table of 3000+ rows is very heavy on the CPU.

---

## Memory Debugging

| Method | What it shows |
|--------|---------------|
| Task Manager Details tab > **Commit Size** column | Total process memory — more accurate than the default Memory column |
| `op.cpuMemory` / `op.gpuMemory` | Per-operator memory usage in Python |
| Perform CHOP `gpu_mem_used` / `cpu_mem_used` channels | Global memory tracking over time |

Combine with Trail CHOP for time-series memory visualization to detect leaks.
