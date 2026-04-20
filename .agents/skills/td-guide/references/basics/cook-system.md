# Cook System & Dependencies

How TouchDesigner decides what to compute and when.

## The 3-Step Mental Model

Everything in TD's cook system follows this sequence:

```
1. DIRTY   →  A value changes somewhere
               The dirty flag propagates DOWNSTREAM ──►

2. REQUEST →  Someone needs the data
               The request travels UPSTREAM  ◄──

3. COOK    →  Dirty + Request = the operator recomputes

⚠️  Dirty alone ≠ cook.  Request alone ≠ cook.
    BOTH are required.
```

### Concrete example

```
Constant1 ──► Math1 ──► Null1

① Change Constant1's value
   → Constant1 becomes dirty
   → Math1 becomes dirty  (downstream propagation)
   → Null1 becomes dirty  (downstream propagation)

② But NOTHING cooks — nobody is requesting their data.

③ Activate Null1's viewer
   → Null1 receives a cook request
   → Null1 asks Math1 for data  (upstream request)
   → Math1 asks Constant1 for data  (upstream request)
   → The entire chain cooks.
```

---

## Pull-Based Architecture

TD is a **pull system**: data flows downstream (left to right), but cook requests travel upstream (right to left). If nothing requests an operator's output, it does not compute — this is lazy evaluation.

This architecture enables natural optimization: if nobody requests data from a branch of the network, that branch doesn't cook. You can design systems that self-optimize.

---

## Cook Conditions

Two conditions must **both** be true for an operator to cook:

### Dirty flag (something changed)

Anything that modifies an operator makes it dirty: changing a parameter, modifying a flag, receiving new input data. The dirty state **propagates downstream** through all outgoing connections, making all downstream operators dirty in the chain.

| Trigger | Example |
|---------|---------|
| Input operator cooked new data | Upstream `noise1` produced a new frame |
| Referenced operator cooked | `op('constant1')` changed, expression depends on it |
| Parameter value changed | `op.par.roughness = 0.5` |
| Script modified the operator | `set_dat_text` or `execute_python_script` |
| Expression result changed | Expression references a changing value |
| Time-dependent flag | Operator uses `absTime.seconds`, `me.time.frame`, etc. |

### Cook REQUEST (someone needs the data)

| Source | Example |
|--------|---------|
| **Active viewer** | Operator is visible in the network editor — **#1 most common trap** |
| Connected downstream operator | Wire from `noise1` → `null1` |
| **Select OP reference** | A Select OP pointing to this operator = permanent cook request |
| **Parameter dialog open** | Opening an op's parameter dialog inspects its data = cook request |
| Parameter reference / expression | `op('noise1').par.roughness` in an expression |
| CHOP/DAT export | CHOP exporting to another op's parameter |
| Device operator downstream | DMX Out, Audio Device Out, etc. connected downstream |
| Explicit call | `op('noise1').cook(force=True)` |

**If request exists but no dirty:** operator skips cook, returns cached output.
**If dirty exists but no request:** operator still skips — nobody needs the data.

> **Critical trap — viewers:** A viewer active on a node at the end of a chain forces the ENTIRE upstream chain to cook. When diagnosing performance, start by closing all unnecessary viewers.

> **Critical trap — Select OP:** A Select OP pointing to an operator is a permanent active cook request. This is a common and powerful pattern (used in Scene Changer), but be aware: an active Select forces the entire upstream chain to cook.

---

## The Switch Pattern: Automatic Optimization

This is one of the most important optimization patterns. Placing a Switch between branches means only the selected branch receives cook requests — the other stops automatically:

```
Branch A ──►┐
             Switch ──► Output
Branch B ──►┘

If Switch index = 0: Branch A cooks, Branch B is completely idle
If Switch index = 1: Branch B cooks, Branch A stops
```

This pattern is free in performance and extremely powerful. Use it whenever you have alternative paths in your network. The Scene Changer architecture is entirely built on this principle (see @../operator-tips.md).

---

## Cook Dependency Graph

TD tracks two types of dependencies:

- **Wire connections** (solid lines) = data dependencies. The downstream operator receives the upstream operator's output directly.
- **Parameter references** (dashed lines) = reference dependencies. An expression like `op('noise1')[0,0]` creates a dependency visible as dashed lines in the network editor.

Both wire and reference dependencies can provide a dirty flag AND a cook request.

### Controlling cook propagation

- `COMP.allowCooking = False` — stops all children of a COMP from cooking. Only applies to COMPs (see guardrail 11).
- `op.bypass = True` — individual operator passes input through without computing.
- `op.lock = True` — freezes the operator's output at current state, stops cooking.

---

## Operators That Always Cook

Some operators cook every frame regardless of the pull system. **They force everything upstream to cook too**, since they generate a permanent cook request that travels up the chain.

> **Critical rule:** An "always cook" operator at the end of a chain forces the ENTIRE preceding network to cook. Design your networks carefully around this.

### Device operators
Video Device In/Out, Audio Device Out (has a "cook every frame" flag to ensure audio never stops). Most have an `Active` flag — disable it when not in use.

### Network/Output operators
DMX Out CHOP (Art-Net, sACN, USB), all networking OPs (must be ready to receive connections), MIDI Out, OSC Out, Video Stream Out (RTMP), Siphon/Spout shared textures.

### Time-dependent operators
Timeline CHOP, Beat CHOP, Clock CHOP, LFO (time-sliced), Noise (if time-sliced). These change value every frame by nature.

### Execute DATs with specific flags
- Execute DAT with **Frame Start** or **Frame End** enabled → cooks every frame
- OP Execute with **Pre-Cook / Post-Cook** → cooks at every cook of the target operator
- CHOP Execute with **While Off** enabled → attempts to execute its script every frame

> **Design goal:** Build components that don't cook when unused. In a purely pull-based system (no device OP or execute forcing cooks), a well-designed particle system will be completely idle until someone requests its output.

---

## Animated Lines: Don't Trust the Visual

Animated lines between nodes show that data is flowing on a connection. But they are **misleading**:

> **Animated lines do NOT mean the downstream node is cooking.** They mean the **upstream** node (where the lines originate) cooked, and data is available on the wire. The downstream node may NOT cook if nobody requests ITS data.

Example: if A → B → C, and A cooks, the lines between A and B will animate. But B only cooks if something requests B's or C's data. Don't confuse "data available on the wire" with "the operator is recomputing."

**When diagnosing performance, trust the numbers (cook time, total cooks) — not animated lines.**

---

## Diagnostic Tools

| Tool | Access | What it shows |
|------|--------|---------------|
| **Info popup** | Middle-click any operator | Cook count, cook time (CPU/GPU), `childrenCPUCookTime`, `childrenGPUCookTime` for COMPs |
| **Performance Monitor** | Alt+Y | Frame-level cook timeline, cook order, dependency analysis. **Frame Trigger** mode captures only frames exceeding a threshold (see @debugging.md) |
| **Perform CHOP** | Create `performCHOP` | 28+ channels: `fps`, `msec`, `cpumsec`, `gpumsec`, `cook`, `dropped_frames` |
| **Palette:probe** | Ctrl+P | Visual overlay with color-coded cook time per operator (see @debugging.md) |
| **Info CHOP** | Connect to any op | `cook time`, `total cooks` channels. **Enable Passive mode** to avoid forcing cooks (see @debugging.md) |
| **OP Find DAT** | Create `opfindDAT` | Sortable table of all ops with CPU/GPU time, memory columns. Filter by family. |
| **Per-operator Python** | `op.cookTime`, `op.cpuCookTime`, `op.gpuCookTime`, `op.totalCooks`, `op.cookedThisFrame` | |

For detailed profiling setup, see `@../python-environment.md` (Performance Profiling section).

---

## Common Cook Pitfalls

1. **Viewers force upstream cooking.** An active viewer on a node at the end of a chain forces the ENTIRE upstream chain to cook. Close all unnecessary viewers when profiling.

2. **`cook(force=True)` from `onFrameEnd` = infinite loop.** An Execute DAT calling `scriptCHOP.cook(force=True)` in `onFrameEnd` creates a cook cycle that freezes TD. Use `comp.store()` to pass data instead (see guardrail 21).

3. **Time-dependent operators cook every frame.** Any expression using `absTime.seconds`, `me.time.frame`, or `absTime.frame` marks the operator as time-dependent — it gets dirty every frame even if nothing else changed.

4. **Script CHOP modifying its own input = feedback loop.** If a Script CHOP's `onCook` callback modifies an operator that feeds back into the Script CHOP, it creates a circular dependency.

5. **Error cache is frame-delayed.** TD updates error state on frame boundaries. After fixing an error via MCP, check errors in a separate `execute_python_script` call — same-call checks return stale state (see guardrail 4).

6. **`pulse()` is frame-delayed.** Parameter pulses (`par.Load.pulse()`, `par.Reset.pulse()`) execute on the next frame, not immediately (see guardrail 18).

7. **DAT/CHOP granularity:** Modifying ONE cell in a Table DAT forces recook of ALL cells. Modifying ONE channel in a CHOP forces recook of ALL channels. With large tables and many references, this cascading cook can be massive. Workaround: separate critical channels/cells into individual CHOPs/DATs.

8. **Select OP = permanent cook request.** A Select pointing to an operator forces the entire upstream chain to cook for as long as the Select is active.
