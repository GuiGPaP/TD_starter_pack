# Operator Tips

Operator-specific patterns, tips, and common pitfalls.

## Contents

1. [Feedback TOP](#feedback-top)
2. [Parent Shortcuts](#parent-shortcuts)
3. [Scene Changer Pattern](#scene-changer-pattern)

---

## Feedback TOP

Used for feedback loops in simulations, trails, and accumulation effects.

### Basic Structure

```
input (initial state) ──┐
                        ├──→ feedback_top ──→ processing ──→ null_out
                        │                                        ↑
                        └── par.top = 'null_out' ────────────────┘
```

**Key points:**
- **Input required** - Used as initial state and when bypassed
- **par.top** - References the downstream output (relative path recommended)
- Initial frame uses input; subsequent frames use par.top reference

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Not enough sources specified" | No input connected | Connect initial state TOP to input |
| Unexpected initial pattern | Wrong initial state | Use Constant TOP (black) for "empty" start |

### Setup Pattern

```python
base = op('/project1/base1')

# 1. Create processing chain
glsl = base.create(glslTOP, 'sim')
glsl.viewer = True
null_out = base.create(nullTOP, 'null_out')
null_out.viewer = True
null_out.nodeX = 200
null_out.inputConnectors[0].connect(glsl)

# 2. Create feedback (reference null_out)
feedback = base.create(feedbackTOP, 'feedback')
feedback.viewer = True
feedback.par.top = 'null_out'  # Relative path

# 3. Create initial state (black for "empty")
const_init = base.create(constantTOP, 'const_init')
const_init.viewer = True
const_init.par.colorr = 0
const_init.par.colorg = 0
const_init.par.colorb = 0

# 4. Connect: initial → feedback, feedback → processing
feedback.inputConnectors[0].connect(const_init)
glsl.inputConnectors[0].connect(feedback)

# 5. Reset to apply initial state
feedback.par.resetpulse.pulse()
```

> **Recommended:** Use the `create_feedback_loop` MCP tool:
>
> MCP tool call: `create_feedback_loop`
> ```json
> { "parentPath": "/project1/base1", "name": "sim", "processType": "glslTOP" }
> ```
> Returns operator summaries: `feedback`, `process`, `null_out`, `const_init`.
> Use the `execute_python_script` pattern below only for non-standard setups.

Also available via `from td_helpers.network import setup_feedback_loop`

```python
from td_helpers.network import setup_feedback_loop
base = op('/project1/base1')
loop = setup_feedback_loop(base, 'sim', x=0, y=0)
# loop = {"feedback", "process", "null_out", "const_init"}
# Custom process type:
# loop = setup_feedback_loop(base, 'sim', process_type='compositeTOP')
```

### Use Cases

#### Wave Simulation
- R channel = height, G channel = velocity
- Initial state: black (height=0, velocity=0)
- Disturbance input adds to height

#### Cellular Automata (Game of Life)
- White = alive, Black = dead
- Initial state: random noise (threshold at 0.5)
- Rules applied per-pixel based on neighbor count

#### Trail / Motion Blur
- Blend current frame with feedback
- Initial state: black or first frame
- Use Cross TOP or alpha blending

### Tips

1. **Use float format** for simulations needing precision:
   ```python
   glsl.par.format = 'rgba32float'
   ```

2. **Reset after setup** to ensure clean initial state:
   ```python
   feedback.par.resetpulse.pulse()
   ```

3. **Soft boundaries** prevent edge artifacts in simulations:
   ```glsl
   float edge = 3.0 * texel.x;
   float bx = smoothstep(0.0, edge, uv.x) * smoothstep(0.0, edge, 1.0 - uv.x);
   float by = smoothstep(0.0, edge, uv.y) * smoothstep(0.0, edge, 1.0 - uv.y);
   value *= bx * by;
   ```

4. **Match resolutions** - feedback, processing, and initial state should have same resolution

---

## Parent Shortcuts

Parent Shortcuts are essential for modular, portable systems in TouchDesigner.

### Setup

On a COMP, define a shortcut name in the **Common** page of parameters (e.g., `show`). Then from any depth inside that COMP:

```python
# Works from ANY depth — automatically walks up the hierarchy
parent.show.par.Resolution

# Instead of fragile relative paths:
op('../../..').par.Resolution    # breaks if you move the component
parent().par.Resolution          # only works one level up
```

### Why it matters

`parent.show` does NOT depend on the number of nesting levels. TD automatically walks up the hierarchy until it finds the COMP with that shortcut. You can move sub-components to different depths without breaking references.

TD uses Parent Shortcuts automatically when you do a "Paste Reference" from a parent COMP parameter — this is Derivative's recommended approach.

```
Example Show  [shortcut: "show", par: Resolution = 1920x1080]
  └─ Scene Lib
       └─ Scene 1
            └─ Sub Component
                 └─ Deep Node
                      → parent.show.par.Resolutionw  ← works!
                        (walks up to Example Show automatically)
```

### When to use

- **Any modular system** where inner components need to reference global parameters
- **Portable components** that may be nested at different depths
- **Scene management** (Scene Changer, show systems)
- **Template-based architectures** where the same template is instantiated in different contexts

---

## Scene Changer Pattern

A modular scene management system designed for production. Based on Ben Voigt's (Derivative) workshop architecture. Available on the Derivative forum.

### Core principles

- Inactive scenes **don't cook at all** — regardless of how many scenes exist (pull system)
- **Modular** — each artist works in their own scene template
- **Parent Shortcuts** for portable references (no hardcoded paths)
- **Python Extensions** for full script control (GrandMA, Ableton, external UI integration)

### Architecture

```
Example Show  [shortcut: "show"]
  ├── Scene Lib
  │     ├── Scene 0 (black)
  │     ├── Scene 1
  │     ├── Scene 2
  │     └── Scene 3
  ├── Blending Engine
  │     ├── OP Find (auto-lists scenes in Scene Lib)
  │     ├── Replicator → creates a Scene Gate per scene
  │     │     └── Each Gate: Select OP → filter → fade control → out
  │     └── Mixer (cross-dissolve between Scene A and Scene B)
  └── UI (optional, decoupled from engine via extensions)
```

### Why inactive scenes don't cook

The blending engine only Selects (via Select OPs) the output of the active scene. Inactive scenes receive NO cook requests → they stay completely idle. When you change scenes, the new scene starts receiving requests (wakes up), the old one stops being referenced (goes idle).

### Scene template conventions

Each scene is a COMP based on a shared template providing:
- **Init / Start callbacks**: triggered when scene is initialized or started (launch simulation, activate renderer)
- **Play flag**: boolean active during playback
- **Length**: scene duration, can be bound to internal Timer CHOP
- **Fade In / Fade Out**: per-scene fade times overriding the global show fade
- **`out1`** (mandatory): video output TOP. Even a black scene must provide `out1` (Constant TOP black)
- **`out2`** (optional): audio output. Must provide channels even if silent

> Every scene MUST have `out1`. The Show always selects `out1` — missing outputs cause errors during transitions.

### Shared resources pattern

Heavy systems (particle engine, 3D render) used by some scenes go **outside** Scene Lib. Scenes that need them use Select OPs:

```
Scene Lib
  ├── Scene 0 (black)
  ├── Scene 2  ──Select──►  Render Scene (particles)
  ├── Scene 3  ──Select──►  Render Scene (particles)
  └── Scene 4

→ Render Scene only cooks when Scene 2 or Scene 3 is active
```

The pull system handles everything: the shared resource cooks only when at least one active scene references it.

### Extensions API

```python
op.show.SceneChange(scene, fade_time)   # Change by name or index
op.show.FireScene()                      # Fire queued scene
op.show.NextScene()                      # Next in index
```

Callable from any external system (OSC, MIDI, custom UI) without touching the Show internals.
