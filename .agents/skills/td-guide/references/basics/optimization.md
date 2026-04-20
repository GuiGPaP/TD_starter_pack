# Performance Optimization

Strategies for identifying and resolving performance bottlenecks in TouchDesigner. Based on official Derivative optimization practices and Ben Voigt's workshop.

## CPU-GPU Pipeline Model

TD processes frames as an assembly line with two stages:

- **CPU stage**: Python expressions, CHOP math, SOP geometry, DAT parsing, parameter evaluation, scripting
- **GPU stage**: TOP pixel processing, Render TOP rendering, GLSL shaders, compositing, post-processing

The pipeline is only as fast as the slowest stage. Optimizing the wrong stage has no effect. TD runs primarily on a **single CPU thread** — if that thread is saturated, any additional load drops the frame rate.

---

## Identifying the Bottleneck

### Quick tests

| Test | How | Result |
|------|-----|--------|
| **Resolution test** | Halve all TOP resolutions (`resolutionw`, `resolutionh`) | FPS unchanged → CPU-bound. FPS improves → GPU-bound |
| **Hog CHOP test** | Insert a `hogCHOP`, set it to consume N ms | FPS drops proportionally → CPU-bound |
| **Perform CHOP** | Compare `cpumsec` vs `gpumsec` channels | Higher value = bottleneck stage |

Note: even when GPU-bound, the Hog CHOP may have a slight impact — it's the **magnitude of the difference** that diagnoses the bottleneck.

### Detailed profiling

- **Performance Monitor** (Alt+Y): per-operator cook timeline, reveals dominant operators. Use **Frame Trigger** to capture only frames exceeding a threshold (e.g., 18ms for 60fps projects) — ideal for intermittent frame drops.
- **Palette:probe** (Ctrl+P): visual heat map of cook times per operator (see @debugging.md).
- **OP Find DAT**: sortable table of all operators with CPU/GPU time, memory columns. Filter by family, sort by cook time.
- **Per-operator Python**: `op.cookTime`, `op.cpuCookTime`, `op.gpuCookTime`

---

## SOP Optimization (CPU-heavy)

SOPs are the heaviest on CPU. This is often where the biggest gains are found.

### Place static operators BEFORE animated ones

If a Noise SOP (time-dependent) is early in the chain, it forces everything downstream to cook every frame. Move static operations (Point SOP adding normals, Sort SOP randomizing order) **before** the animated operator.

```
# Bad — Sort cooks every frame because Noise dirties the chain
Sphere → Noise → Sort → Particle

# Good — Sort cooks once, only Noise cooks per frame
Sphere → Sort → Noise → Particle
```

> **Rule:** Everything that doesn't change must be placed BEFORE the animated operator in the chain.

### Transform at Geometry COMP level, not SOP level

A Transform SOP on 1600 points moves each point individually on CPU: ~1ms. A transform on the Geometry COMP (`tx/ty/tz/rx/ry/rz/sx/sy/sz` parameters) moves the object as a single block on GPU: ~0.02ms. **Factor 50x.**

Not always possible — if the transform must affect local object space (e.g., particles interacting with the surface), stay in SOP. But when possible, the gain is massive. Tip: if you must transform in SOP, do it early in the chain when geometry has the fewest points.

### Place materials on Geometry COMP, not Material SOP

Material SOP makes a material call **per primitive**. The Geometry COMP Render page makes **one call** for the entire object. Significant difference on complex geometry.

### Use GPU Instancing

For repeated objects, particles, or large point sets, use Geometry COMP instancing. Since 2020+ builds, you can use any operator (including a SOP) directly as instance source for position, color, etc. — no SOP To CHOP intermediate needed. The GPU handles duplication and placement, freeing the CPU.

### Work in polygons

All geometry types (NURBS, Beziers) are converted to polygons before rendering. Convert at import (FBX import stage) rather than letting TD do it on the fly. Polygon type is slightly faster than Mesh.

### Minimize animated SOPs

Aim for the fewest possible SOPs that cook every frame. Each SOP that cooks per frame recomputes geometry on CPU.

---

## CHOP Optimization

### Lag, Filter, and Slope always cook

These operators are **time-dependent**: they compare the current frame to the previous one. This makes them inherently time-dependent, and everything downstream cooks permanently too.

> **Rule:** Place Lag, Filter, and Slope as LATE as possible in the chain. If placed at the beginning, the entire downstream network cooks unnecessarily every frame.

### Time-sliced / non-time-sliced mixing trap

A non-time-sliced CHOP is positioned at frame 0 (a single fixed sample). Combining it with a time-sliced CHOP via Merge or Math with certain settings (`Combine Channels`, certain `Channel Pre` ops) can create a channel that **grows indefinitely** over time. This is heavy on memory and computation — a silent bug.

Solution: apply the pre-operator on the individual channel via a dedicated Math CHOP before combining.

### DAT/CHOP granularity limitation

> Modifying ONE cell in a Table DAT forces recook of ALL cells. Everything referencing that table (even other columns) recooks too.

> Modifying ONE channel in a CHOP forces recook of ALL channels in the same CHOP.

This is a known limitation. Workarounds: separate critical channels/cells into individual CHOPs/DATs, or use CHOP Execute / DAT Execute to propagate changes selectively.

### Null CHOP Selective mode — placement matters

The Null CHOP in "Selective" mode has a dual behavior:
- **Downstream**: prevents following operators from cooking when data hasn't actually changed (compares incoming data)
- **Upstream**: **forces** preceding operators to cook permanently (to have data to compare)

**Placement is strategic.** Place it after an expensive downstream section but with a lightweight upstream. Too late = all upstream cooks for nothing. Too early = no downstream protection benefit.

---

## TOP Optimization (GPU-heavy)

### Resolution is the #1 lever

Pixel shaders account for ~95% of GPU bottlenecks. Reduce Render TOP resolution first, upscale at the end. Max resolution depends on GPU (up to 32768 pixels — TD caps at the GPU's supported maximum).

### Pixel format and memory

Switching from 8-bit fixed to 32-bit float barely changes cook time but **explodes GPU memory**: 128MB per 4K texture instead of 31MB. Use Probe in GPU Memory mode to visualize the impact.

### Sensitive operators

| Operator | Sensitivity | Detail |
|----------|------------|--------|
| **Blur TOP** | `filter size` parameter | Small increase (0.1 → higher) can go from 0.4ms to 2-3ms GPU cook time |
| **Noise TOP** | RGB mode = 3x cost | 3 noise layers instead of 1. Alpha noise on Output page adds another layer. **Harmonics** multiply cost proportionally: `harmonics=10` = 10x the cost |
| **SSAO TOP** | Heavy by nature | Elegant rendering but expensive. Use with care |
| **Flex / Flow TOPs** | Full NVIDIA particle/fluid systems | Inherently heavy |

### Reduce overdraw
- Enable **Early Depth-Test** on Render TOP (`Advanced` page)
- Enable **Back-Face Culling** on materials

### Reduce light count
Each light adds a render pass. Bake static lighting when possible.

### Post-process at lower resolution
Apply Blur, Bloom, and other effects at reduced resolution, then upscale at the final stage.

---

## Python Expression Optimization

TD optimizes certain expressions by evaluating them directly in **C++ rather than Python**. Hover over an expression to see `(optimized)` or `(unoptimized)` in the tooltip.

- All internal TD functions are optimized
- Standard Python functions (like `clamp()`) are not
- **Difference: factor 5-8x** (0.05ms vs 0.4ms)

> If an expression must be re-evaluated every frame (dynamic string, changing elements), it **won't be optimized** even if the functions normally are.

**Solution:** Isolate the dynamic part (e.g., `op('...').val`) in a sub-expression and keep the rest with optimized functions. This can halve cook time.

---

## Memory Management

| Issue | Solution |
|-------|----------|
| `audioplayCHOP` loads entire file into RAM | Use `audiofileinCHOP` — streams from disk |
| Inaccurate memory readings | Task Manager Details tab → "Commit Size" column |
| Finding memory hogs | `op.cpuMemory` and `op.gpuMemory` per operator in Python |
| TOP resolution impacts GPU memory | 1920x1080 RGBA32float ≈ 32MB per TOP. Reduce resolution or bit depth |
| 4K square 32-bit float texture | ~128MB GPU memory per TOP |
| Global memory tracking | Perform CHOP: `gpu_mem_used`, `cpu_mem_used` channels |

---

## Conditional Cooking

### allowCooking / bypass / lock

```python
# Disable all children of a COMP (e.g., off-screen UI panel)
op('panel_hidden').allowCooking = False  # COMPs only (guardrail 11)

# Bypass a single operator (passes input through unchanged)
op('expensive_blur').bypass = True

# Lock an operator (freezes output at current state)
op('noise1').lock = True
```

### Switch pattern (automatic)

The Switch OP naturally prevents inactive branches from receiving cook requests. Only the selected input cooks; all others go idle. See @cook-system.md Switch Pattern section.

### Tabbed UI pattern — disable inactive pages

`display = False` on a COMP only hides it visually — all children still cook. For tabbed interfaces, toggle `allowCooking` on inactive pages via a Parameter Execute DAT:

```python
# parameterexecuteDAT watching folderTabs.par.Value0
def onValueChange(par, prev):
    active = str(par)
    ui = me.parent()
    for page_name, tab_id in [('page_mixer', 'mixer'), ('page_pads', 'pads')]:
        page = ui.op(page_name)
        if page:
            page.allowCooking = (active == tab_id)
```

`allowCooking` is a Python property (not a parameter) — it cannot be set via expression, only via callback or script. Apply initial state in an Execute DAT `onStart`.

### Palette widget rollover optimization

Palette Basic Widgets (knob, slider, button, folderTabs) embed ~30-40 internal operators each, including `rollover` and `overlay` containers that cook on every mouse movement. With deep nesting (8+ levels), each hover pixel triggers a cook chain propagating up through all parent levels.

**Fix:** Disable all rollover/overlay containers at startup:

```python
# In an Execute DAT onStart callback
def disable_rollovers(comp, depth=0):
    if depth > 10:
        return
    for c in comp.children:
        if c.isCOMP and c.name in ('rollover', 'overlay'):
            c.allowCooking = False
        if c.isCOMP:
            disable_rollovers(c, depth + 1)

disable_rollovers(op('/project1/ui_main'))
```

Click/drag interaction is unaffected — only the hover highlight disappears. Measured impact: eliminated 4000+ unnecessary cooks and FPS drops during mouse interaction.

---

## Preloading Assets

### Geometry preloading

Without preloading, the first time TD displays heavy geometry, the system **freezes** during loading. Force recursive cooking at startup:

```python
# In an Execute DAT onStart callback:
op('path/to/component').cook(force=True, recurse=True)
```

This forces every operator inside the component to cook, loading all geometry into GPU memory. Takes time at startup but prevents freezes during use.

### Video preloading

Movie File In TOP has a `preload()` method:

```python
for o in ops('path/*'):
    if o.type == 'moviefilein':
        o.preload()
```

After preloading, scrubbing between 4K videos happens without pops or frame drops.

> **Preloading is mandatory** in multi-process configurations. Without it, the first scene transition causes a visible hitch.

---

## Multi-Process and Engine COMP

When a single process hits its limits, distribute the load:

### Multiple TD processes
Launch two `.toe` files via a batch script. Use `GPU Affinity` and `Use GPU for Monitor` to assign each process to a different GPU. Communicate between processes via OSC, NDI, or shared memory. Tradeoff: parallelism gain vs. communication complexity and latency.

### Engine COMP
Save a heavy component as `.tox`, load it in an Engine COMP. It runs in its own process (visible as "Touch Engine" in Task Manager). The main process frame time is barely affected. Currently uses the same GPU as the host process (GPU selection is in development).

---

## Streaming to Other Applications

### Same machine

| Method | Detail |
|--------|--------|
| **Siphon (macOS) / Spout (Windows)** | GPU memory sharing, very fast, zero compression. Best local option. |
| **NDI** | Works locally via loopback. Good and fast. |
| **Touch Out / Touch In TOP** | Native TD solution. Supports uncompressed (heavy) or HAP-Q (compressed). |

### Between machines

| Method | Detail |
|--------|--------|
| **NDI** | Free, works on LAN, but with compression. 4K@60fps possible but at the limit. Sensitive to network issues. |
| **SDI** | Best quality and reliability, highest cost. No compression, predictable latency (3-4 frames). Professional solution for critical installations. |

---

## Performance Debug Checklist

When your project isn't hitting target frame rate, check in this order:

1. **Close unnecessary viewers.** Each active viewer forces its entire upstream chain to cook.
2. **CPU-bound or GPU-bound?** Hog CHOP (CPU) + resolution test (GPU). Strategies differ completely.
3. **Unused device OPs active?** Audio Device Out, DMX Out, etc. with `Active` on force all upstream to cook. Disable them.
4. **Lag/Filter/Slope too early in chain?** Move them as late as possible — they're time-dependent.
5. **Select OP or CHOP Export forcing unwanted cooks?** Every active reference is a permanent cook request.
6. **Large DAT table or multi-channel CHOP cascading?** One cell/channel change recooks everything. Separate if needed.
7. **Static SOPs after animated SOPs?** Reorder: static operations first, animated last.
8. **Can you reduce resolution?** Trace SOP, Blob Track, intermediate textures — half resolution often suffices.
9. **Can you replace SOP processing with GPU Instancing?** Often the biggest gain on particle systems (5x or more).
10. **Assets preloaded at startup?** Heavy geometry and 4K videos must be force-cooked at launch.

### Tools by speed of diagnosis

1. **Middle-click** nodes → instant cook time
2. **Perform CHOP / Stats** → global frame time overview
3. **Probe** (Ctrl+P) → visual heat map of bottlenecks
4. **Info CHOP + Trail** → targeted time-series monitoring (**enable Passive mode!**)
5. **OP Find DAT** → sortable, filterable table of all cook times
6. **Performance Monitor + Frame Trigger** → analysis of intermittent frame drops
