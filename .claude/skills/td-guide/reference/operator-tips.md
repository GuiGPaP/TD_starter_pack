# Operator Tips

Operator-specific patterns, tips, and common pitfalls.

## Contents

1. [Feedback TOP](#feedback-top)

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
