# Performance Optimization for TD Shaders

Expert-level optimization strategies for TouchDesigner's GPU execution environment.

## Profiling in TouchDesigner

### Performance Monitor Integration
- Enable Performance Monitor (`Alt+P`) and watch for:
  - **Cook Time**: Total GPU execution time
  - **GPU Memory**: VRAM usage
  - **GPU to CPU**: Data transfer bottlenecks
- Use `Info CHOP` to extract timing data programmatically
- Monitor `Texture Memory` in Palette Browser

### GPU Profiler Setup
```python
# Extract cook times via Python
op('glsl1').cook(force=True)
cookTime = op('glsl1').cookTime
print(f"Shader cook time: {cookTime}ms")
```

### Identifying Bottlenecks
1. **Fragment-bound**: High resolution textures, complex per-pixel math
2. **Vertex-bound**: High poly count, complex vertex transformations
3. **Memory-bound**: Excessive texture fetches, large buffer reads
4. **CPU-GPU transfer**: Excessive uniform updates, texture uploads

## Memory Optimization

### Texture Sampling Strategy
```glsl
// ❌ BAD: Multiple dependent texture fetches
vec4 color = texture(tex, uv);
vec4 neighbor = texture(tex, uv + color.rg * 0.1);

// ✅ GOOD: Minimize dependent reads
vec4 color = texture(tex, uv);
vec4 neighbor = texture(tex, uv + vec2(0.01)); // Independent read
```

### Texture Format Selection
- **R8/RG8**: Grayscale/2-channel data (noise maps, flow fields)
- **RGB8**: Standard color (most effects)
- **RGBA16F**: HDR with moderate precision
- **RGBA32F**: Full precision (avoid unless necessary)
- Rule: Use smallest format that maintains quality

### Minimize Texture Fetches
```glsl
// ❌ BAD: Redundant samples
vec4 c1 = texture(tex, uv);
vec4 c2 = texture(tex, uv); // Same sample twice

// ✅ GOOD: Cache results
vec4 c = texture(tex, uv);
vec4 result = c * someValue + c * otherValue;
```

### Mipmapping
- Enable mipmaps for textures sampled at varying scales
- Use `textureGrad()` or `textureLod()` for explicit mip control
- TD auto-generates mipmaps: ensure `Resize TOPs` use correct filter

## Computation Optimization

### Algebraic Simplification
```glsl
// ❌ BAD: Redundant operations
float result = pow(x, 2.0) + pow(y, 2.0);

// ✅ GOOD: Simplified
float result = x*x + y*y;

// ❌ BAD: Division in loop
for(int i = 0; i < N; i++) {
    result += something / constant;
}

// ✅ GOOD: Multiply by inverse
float inv = 1.0 / constant;
for(int i = 0; i < N; i++) {
    result += something * inv;
}
```

### Vectorization
```glsl
// ❌ BAD: Scalar operations
float r = someOp(color.r);
float g = someOp(color.g);
float b = someOp(color.b);
vec3 result = vec3(r, g, b);

// ✅ GOOD: Vector operation
vec3 result = someOp(color.rgb);
```

### Early Exit
```glsl
// ❌ BAD: Unnecessary computation
vec4 color = expensiveOperation();
if(alpha < 0.01) {
    return vec4(0.0);
}
return color;

// ✅ GOOD: Early exit
if(alpha < 0.01) {
    return vec4(0.0);
}
return expensiveOperation();
```

### Conditional Optimization
```glsl
// ❌ BAD: Branch divergence
if(someCondition) {
    result = expensiveA();
} else {
    result = expensiveB();
}

// ✅ BETTER: Branchless when possible
float factor = float(someCondition);
result = mix(expensiveB(), expensiveA(), factor);

// ⚠️ NOTE: Only faster if both paths are cheap
// For expensive operations, branching is better
```

### Precision Qualifiers
```glsl
// Use appropriate precision (mobile/embedded focus)
uniform lowp sampler2D noiseTex;      // 8-bit precision OK
uniform mediump vec2 offset;           // 16-bit precision OK
uniform highp mat4 transformMatrix;    // Need full 32-bit

// Desktop GPUs: minimal impact, but good practice
```

## Loop Optimization

### Unroll When Possible
```glsl
// ❌ BAD: Small known loops
for(int i = 0; i < 4; i++) {
    sum += texture(tex, uv + offsets[i]);
}

// ✅ GOOD: Manual unroll
sum += texture(tex, uv + offsets[0]);
sum += texture(tex, uv + offsets[1]);
sum += texture(tex, uv + offsets[2]);
sum += texture(tex, uv + offsets[3]);
```

### Constant Loop Bounds
```glsl
// ❌ BAD: Dynamic loop bound
for(int i = 0; i < dynamicCount; i++) {
    // Won't unroll, may cause issues
}

// ✅ GOOD: Constant upper bound
const int MAX_SAMPLES = 16;
for(int i = 0; i < MAX_SAMPLES; i++) {
    if(i >= dynamicCount) break;
    // Can be unrolled
}
```

## Multi-Pass Optimization

### Separable Filters
```glsl
// Instead of 2D convolution (NxN samples):
for(int x = -radius; x <= radius; x++) {
    for(int y = -radius; y <= radius; y++) {
        result += texture(tex, uv + vec2(x,y) * texel);
    }
}

// Use two 1D passes (2N samples total):
// Pass 1 (horizontal): N samples
// Pass 2 (vertical): N samples
```

### Resolution Scaling
- Expensive effects: render at lower resolution, upscale
- Example: Blur at 50% resolution saves 75% of samples
- Use TD's `Resolution` parameter intelligently

### Ping-Pong Buffers
```python
# For iterative effects (reaction-diffusion, feedback)
# Use two buffers, alternate each frame
feedback1 = op('feedback1')
feedback2 = op('feedback2')

if frame % 2 == 0:
    glsl.par.Feedbacktex = feedback1
    feedback2.copy(glsl)
else:
    glsl.par.Feedbacktex = feedback2
    feedback1.copy(glsl)
```

## TouchDesigner-Specific Optimizations

### Uniform Update Frequency
```python
# ❌ BAD: Update every frame unnecessarily
def onFrameStart(frame):
    op('glsl1').par.Staticvalue = 1.0  # Constant!

# ✅ GOOD: Set once
op('glsl1').par.Staticvalue = 1.0
```

### Texture Input Optimization
- Use `Texture 3D TOP` for volumetric data instead of multiple 2D TOPs
- Avoid texture switches mid-network if possible
- Consider texture arrays for related textures

### Avoid GPU->CPU Readback
```python
# ❌ VERY BAD: Forces GPU sync
pixels = op('top1').numpyArray()  # Stalls pipeline

# ✅ GOOD: Process on GPU
# Chain TOPs instead of reading back to CPU
```

### Shared Uniforms
```glsl
// ❌ BAD: Duplicate calculations in multiple shaders
// Shader A: calculates complex time-based value
// Shader B: recalculates same value

// ✅ GOOD: Calculate once in Python/CHOP, pass as uniform
```

## Compute Shader Optimizations

### Work Group Size
```glsl
// Optimal sizes: multiples of 32 (warp size)
layout(local_size_x = 16, local_size_y = 16) in;  // 256 threads: good
layout(local_size_x = 8, local_size_y = 8) in;    // 64 threads: OK
layout(local_size_x = 17, local_size_y = 13) in;  // 221 threads: wasteful
```

### Shared Memory Usage
```glsl
// Cache frequently accessed data in shared memory
layout(local_size_x = 16, local_size_y = 16) in;
shared vec4 sharedData[16][16];

void main() {
    ivec2 localID = ivec2(gl_LocalInvocationID.xy);
    ivec2 globalID = ivec2(gl_GlobalInvocationID.xy);
    
    // Load to shared memory
    sharedData[localID.x][localID.y] = imageLoad(inputImg, globalID);
    barrier();
    memoryBarrierShared();
    
    // Now all threads can access shared data efficiently
    vec4 result = processWithNeighbors(sharedData, localID);
    imageStore(outputImg, globalID, result);
}
```

### Memory Coalescing
```glsl
// ❌ BAD: Strided access pattern
int index = int(gl_GlobalInvocationID.x) * stride + offset;

// ✅ GOOD: Sequential access
int index = int(gl_GlobalInvocationID.x);
```

## Debugging Performance Issues

### Binary Search Optimization
1. Comment out half the shader
2. If fast: problem is in commented section
3. If still slow: problem is in active section
4. Repeat until isolated

### Replacement Testing
```glsl
// Replace expensive operations with constants
// vec4 color = complexFunction(uv);
vec4 color = vec4(1.0, 0.0, 0.0, 1.0);  // Test if this is the bottleneck

// If now fast, optimize complexFunction()
```

### TD Performance Comparison
```python
# Script to time shader variants
import time

variants = ['glsl_v1', 'glsl_v2', 'glsl_v3']
results = {}

for variant in variants:
    op_ref = op(variant)
    op_ref.cook(force=True)
    
    # Average over 100 frames
    times = []
    for _ in range(100):
        start = time.perf_counter()
        op_ref.cook(force=True)
        times.append(time.perf_counter() - start)
    
    results[variant] = sum(times) / len(times)
    
print(results)
```

## Platform-Specific Considerations

### Desktop (High-end)
- Favor quality over optimization
- Can use complex noise, high-order functions
- 4K textures typically fine

### VR/Real-time (60-90 FPS)
- Target <11ms per frame (90 FPS)
- Minimize texture fetches
- Use LOD aggressively

### Installation/Long-running
- Watch for memory leaks (accumulating buffers)
- Thermal throttling: sustained load optimization
- Failsafe modes for degraded performance

## Common Performance Pitfalls in TD

### Pitfall 1: Excessive Texture Resolutions
```python
# Check all TOPs in network
for top in ops.findChildren(type=TOP):
    if top.width > 1920:
        print(f"{top.name}: {top.width}x{top.height} - consider reducing")
```

### Pitfall 2: Unbounded Feedback Loops
- Always have a clear exit condition
- Monitor memory usage over time
- Use `Limit TOP` to prevent runaway growth

### Pitfall 3: Uniform Thrashing
- Batch uniform updates
- Use UBOs (Uniform Buffer Objects) for large data sets
- Consider baking animated values into textures

### Pitfall 4: Render Order Dependencies
- Minimize TOP network depth
- Parallel chains are faster than serial
- Cache intermediate results

## Optimization Checklist

Before finalizing a shader:
- [ ] Profiled with TD Performance Monitor
- [ ] Texture formats minimized
- [ ] Loops unrolled where beneficial
- [ ] Texture fetches reduced to minimum
- [ ] Algebraic simplifications applied
- [ ] Early exits implemented
- [ ] Tested at target resolution
- [ ] Multi-pass decomposition considered
- [ ] Uniform update frequency optimized
- [ ] Memory leaks checked (long-running test)

## When NOT to Optimize

Premature optimization wastes time:
- Shader already hitting frame rate target
- Not a bottleneck in the full pipeline
- Complexity cost > performance gain
- One-off prototype work

Optimize when:
- Missing frame rate targets
- Performance Monitor shows high cook times
- Thermal throttling occurs
- Deployment platform is constrained
