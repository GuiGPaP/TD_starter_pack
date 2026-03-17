---
name: touchdesigner-glsl
description: Comprehensive GLSL shader workflows for TouchDesigner. Use when working with GLSL shaders in TD - covers pixel/fragment, vertex, compute shaders, debugging compilation errors, performance optimization, common shader patterns (noise, distortion, color grading), multi-pass rendering, TD-specific integration (uniforms, textures, coordinate systems), and troubleshooting runtime issues.
---

# TouchDesigner GLSL Shader Workflows

Expert-level GLSL shader development for TouchDesigner covering all shader types, debugging strategies, performance optimization, and TD-specific integration patterns.

## Quick Start

**Choose shader type:**
- **Image effects**: Use GLSL TOP with fragment shader → Start with `assets/templates/pixel-shader-template.glsl`
- **3D materials**: Use GLSL MAT with vertex + fragment → Start with `assets/templates/material-shader-template.glsl`
- **Parallel processing**: Use GLSL Compute TOP → Start with `assets/templates/compute-shader-template.glsl`
- **Complex effects**: Multi-pass setup → See `assets/templates/multi-pass-example.glsl`

**Common patterns:** Check `references/common-patterns.md` for noise, distortions, color ops, SDFs, blend modes.

## Shader Type Selection

### GLSL TOP (Fragment Shader)
**Use for:**
- 2D image processing (blur, distortion, color grading)
- Texture effects and generators
- Screen-space effects
- Real-time feedback loops

**Limitations:**
- No vertex manipulation
- Single output texture
- No access to geometry data

**Template:** `assets/templates/pixel-shader-template.glsl`

### GLSL MAT (Full Material)
**Use for:**
- 3D rendering with geometry
- Custom lighting models
- Vertex displacement/animation
- Multiple render targets (MRT)

**Requires:**
- Render TOP setup
- Geometry input
- Camera configuration

**Template:** `assets/templates/material-shader-template.glsl`

### GLSL Compute TOP
**Use for:**
- Parallel image processing at scale
- GPU-accelerated algorithms
- Shared memory operations
- Custom convolutions/filters

**Advantages:**
- Direct memory access
- Work group synchronization
- Better for complex algorithms

**Template:** `assets/templates/compute-shader-template.glsl`

## Development Workflow

### 1. Start with Template
```bash
# Copy appropriate template from assets/templates/
# Modify main() function for your effect
```

### 2. Setup in TouchDesigner
**GLSL TOP:**
1. Create GLSL TOP operator
2. Paste shader in Fragment Shader page
3. Connect texture inputs
4. Bind uniforms in Uniform Parameters

**GLSL MAT:**
1. Create GLSL MAT operator
2. Enable Vertex and Fragment shader pages
3. Paste shaders in respective pages
4. Connect to Render TOP via Material parameter
5. Bind textures and uniforms

**Compute TOP:**
1. Create GLSL Compute TOP
2. Set resolution
3. Paste compute shader
4. Configure work group size (auto-calculated)

### 3. Bind Uniforms
**Time-based values:**
```python
# Option 1: Direct binding
glsl.par.Uniformname0 = 'uTime'
glsl.par.Value0 = absTime.seconds

# Option 2: CHOP input (better for animation)
# Create Timer CHOP, connect to GLSL uniform input
```

**Static values:**
```python
glsl.par.Uniformname1 = 'uIntensity'
glsl.par.Value1 = 0.5
```

**See:** `references/td-integration.md` for complete uniform system details

### 4. Debug Compilation Errors
**Check console for errors:**
```python
if op('glsl1').errors:
    print(op('glsl1').errors)
```

**Common issues:**
- Undefined variables → Add uniform declaration
- Syntax errors → Check semicolons, braces
- Type mismatches → Verify argument types

**See:** `references/debugging-strategies.md` for systematic debugging process

### 5. Visual Debugging
```glsl
// Output debug values as colors
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Debug UV coordinates
    fragColor = vec4(uv, 0.0, 1.0);
    
    // Debug specific values
    // fragColor = vec4(vec3(debugValue), 1.0);
}
```

Use Analyze TOP to read exact pixel values.

### 6. Performance Profiling
```python
# Monitor cook times
op('glsl1').cook(force=True)
cook_time = op('glsl1').cookTime
print(f"Cook time: {cook_time}ms")
```

Enable Performance Monitor (`Alt+P`) to track GPU usage.

**See:** `references/performance-optimization.md` for detailed optimization strategies

## Common Patterns Library

Access frequently-used shader building blocks in `references/common-patterns.md`:

**Noise Functions:**
- 2D/3D Simplex noise
- Value noise (fast)
- FBM (Fractal Brownian Motion)

**Distortions:**
- Domain warping
- Chromatic aberration  
- Lens distortion
- Flow fields

**Color Manipulation:**
- HSV/RGB conversion
- Contrast, levels, curves
- Tone mapping (Reinhard, ACES, Uncharted 2)

**UV Operations:**
- Rotation, kaleidoscope
- Polar coordinates
- Tiling and mirroring

**SDF Operations:**
- Basic shapes (circle, box, segment)
- Boolean operations (union, subtraction)
- Smooth blending

**Blend Modes:**
- Screen, multiply, overlay, soft light, add

**Sampling Patterns:**
- Box blur, Gaussian blur (separable)
- Custom kernels

**Copy and adapt patterns rather than rewriting from scratch.**

## Multi-Pass Workflows

For complex effects requiring multiple shader stages:

### Pattern: Separable Blur
```
Source → Blur Horizontal → Blur Vertical → Output
```
**Saves:** NxN samples → 2N samples

### Pattern: Downsample-Process-Upsample
```
Source → Downsample 50% → Expensive Effect → Upsample → Composite
```
**Saves:** 75% of processing for expensive operations

### Pattern: Bloom Effect
```
Source → Downsample → Blur H → Blur V → Upsample → Composite with Original
```

**Complete example:** See `assets/templates/multi-pass-example.glsl`

**Python orchestration:**
```python
# Chain passes programmatically
passes = ['downsample', 'blur_h', 'blur_v', 'upsample']
current = op('source')

for pass_name in passes:
    glsl = op(pass_name)
    glsl.par.inputop = current
    current = glsl
```

## TouchDesigner Integration Specifics

### Auto-Generated Uniforms

**GLSL TOP:**
```glsl
uniform vec3 uTD2DInfos[9];
// [0].xy = resolution
// [0].z = aspect ratio
```

**GLSL MAT:**
```glsl
uniform mat4 uTDMats[6];
// [0] = world matrix
// [4] = worldCamProject matrix (most common)

uniform vec3 uTDGeneral[1];
// .x = near, .y = far, .z = aspect
```

### Texture Input System
```glsl
// Auto-declared: sTD2DInputs[0] through sTD2DInputs[7]
vec4 tex0 = texture(sTD2DInputs[0], uv);
vec4 tex1 = texture(sTD2DInputs[1], uv);
```

### Coordinate System
TD uses bottom-left origin (OpenGL standard).
```glsl
// Flip Y if needed:
vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
```

### Precision Management
```glsl
// Force high precision for critical calculations
highp float preciseValue = criticalCalculation();
```

**Complete integration guide:** `references/td-integration.md`

## Performance Optimization Checklist

Before finalizing:
- [ ] Minimize texture fetches (cache samples)
- [ ] Use appropriate texture formats (rgba8 vs rgba16f vs rgba32f)
- [ ] Separate 2D filters into 1D passes
- [ ] Downsample for expensive operations
- [ ] Vectorize operations (process RGB together)
- [ ] Early exit when possible
- [ ] Unroll small known loops
- [ ] Profile with Performance Monitor
- [ ] Check cook times (< 16ms for 60fps)

**For mobile/VR:** Aggressive LOD, minimal texture fetches, lowp/mediump precision

**Detailed optimizations:** `references/performance-optimization.md`

## Debugging Strategies

### Compilation Errors

**Systematic approach:**
1. Start with minimal shader (solid color output)
2. Progressively add code back
3. Binary search to isolate error
4. Check line numbers in error messages

**Common fixes:**
```glsl
// Missing semicolon
vec3 color = vec3(1.0);  // ← Add semicolon

// Type mismatch
vec3 color = someFunction();  // Returns vec3
float value = color;  // ✗ Wrong
float value = color.r;  // ✓ Correct

// Undefined uniform
uniform float uTime;  // ← Declare before use
```

### Runtime Issues

**Black output:**
- Check for NaN/Inf values
- Verify alpha channel
- Check division by zero

**Flickering:**
- Initialize all variables
- Use higher precision
- Check feedback loop initialization

**Seams/Discontinuities:**
- Floating-point precision at boundaries
- Texture wrap mode settings
- Interpolation issues

**Debug visualization patterns:** `references/debugging-strategies.md`

## Common Workflows

### Workflow 1: Image Effect Development
1. Copy `assets/templates/pixel-shader-template.glsl`
2. Implement effect in main() function
3. Add custom uniforms for parameters
4. Test with various input textures
5. Profile and optimize

### Workflow 2: 3D Material Creation
1. Copy `assets/templates/material-shader-template.glsl`
2. Implement vertex displacement (if needed)
3. Implement lighting/material in fragment shader
4. Connect to Render TOP
5. Bind textures and uniforms
6. Test with different geometry

### Workflow 3: Compute-Based Processing
1. Copy `assets/templates/compute-shader-template.glsl`
2. Define work group size
3. Implement processing logic
4. Use shared memory for neighborhood ops
5. Test and profile

### Workflow 4: Multi-Pass Effect
1. Design pass pipeline (downsample → process → upsample)
2. Create GLSL TOP for each pass
3. Connect passes sequentially
4. Use Python to orchestrate
5. Optimize resolution per pass

### Workflow 5: Porting from ShaderToy
1. Replace uniforms: `iResolution` → `uTD2DInfos[0].xy`
2. Replace texture samplers: `iChannel0` → `sTD2DInputs[0]`
3. Add output declaration: `out vec4 fragColor;`
4. Flip Y coordinate if needed
5. Test and adjust

## Troubleshooting Guide

**"Shader won't compile"**
→ Check console for errors, verify syntax, see `references/debugging-strategies.md`

**"Black screen output"**
→ Check for NaN/Inf, verify alpha, test with solid color

**"Performance is slow"**
→ Profile with Performance Monitor, see `references/performance-optimization.md`

**"Works in editor, breaks in perform"**
→ Add epsilon to divisions, clamp outputs, check precision

**"Texture input not working"**
→ Verify connection, check texture resolution, use safeSample()

**"Uniform values not updating"**
→ Check binding, use CHOP for animated values

**"Feedback loop issues"**
→ Initialize properly, check first frame handling

## Best Practices

1. **Start Simple:** Begin with template, add complexity incrementally
2. **Name Conventions:** Use `u` prefix for uniforms, `s` for samplers, `a` for attributes, `v` for varyings
3. **Comment Code:** Document non-obvious operations
4. **Profile Early:** Check performance before optimization
5. **Modular Design:** Separate effects into functions
6. **Use References:** Leverage `references/common-patterns.md` patterns
7. **Version Control:** Save shader code in Text DATs
8. **Error Handling:** Always check for edge cases (out of bounds, zero division)
9. **Test Variations:** Try different inputs, resolutions, parameters
10. **Document Uniforms:** Note expected ranges and purposes

## Reference Files

- **`references/common-patterns.md`**: Noise, distortions, color ops, SDFs, blend modes, sampling
- **`references/performance-optimization.md`**: Profiling, memory optimization, compute optimization, platform considerations
- **`references/td-integration.md`**: Uniform system, texture inputs, GLSL MAT details, TD quirks
- **`references/debugging-strategies.md`**: Compilation errors, runtime debugging, visual techniques, TD-specific debugging

## Templates

- **`assets/templates/pixel-shader-template.glsl`**: GLSL TOP fragment shader starting point
- **`assets/templates/material-shader-template.glsl`**: GLSL MAT vertex + fragment shaders
- **`assets/templates/compute-shader-template.glsl`**: GLSL Compute TOP with shared memory patterns
- **`assets/templates/multi-pass-example.glsl`**: Multi-pass effect orchestration example

## When to Read Reference Files

**Read `common-patterns.md` when:**
- Need noise/distortion/color manipulation
- Implementing specific visual effect
- Looking for SDF or blend mode implementations

**Read `performance-optimization.md` when:**
- Shader is slow/missing frame rate
- Deploying to constrained platform
- Working with high-resolution textures
- Implementing compute shaders

**Read `td-integration.md` when:**
- Setting up uniforms and textures
- Working with GLSL MAT for first time
- Encountering TD-specific quirks
- Need coordinate system clarification

**Read `debugging-strategies.md` when:**
- Compilation errors occur
- Runtime behavior is unexpected
- Need systematic debugging approach
- Visual debugging techniques needed

## Quick Reference

**Get UV coordinates:**
```glsl
vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
```

**Sample texture safely:**
```glsl
vec4 color = texture(sTD2DInputs[0], uv);
```

**Bind uniform from Python:**
```python
op('glsl1').par.Uniformname0 = 'uTime'
op('glsl1').par.Value0 = absTime.seconds
```

**Check compilation errors:**
```python
if op('glsl1').errors:
    print(op('glsl1').errors)
```

**Profile performance:**
```python
cook_time = op('glsl1').cookTime
print(f"Cook time: {cook_time}ms")
```
