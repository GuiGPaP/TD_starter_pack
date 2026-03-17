# TouchDesigner GLSL Integration

Expert guide to TD's shader implementation specifics, uniform system, and integration patterns.

## TD Shader Types and Operators

### GLSL TOP
- Fragment shader only
- Auto-generated vertex shader
- Input: 1-8 texture inputs
- Output: Single texture

### GLSL MAT
- Complete material (vertex + pixel + optional geometry)
- Used with Render TOPs
- Access to geometry attributes
- Multiple render targets

### GLSL Compute TOP
- Compute shader (GLSL 430+)
- Direct image read/write
- Work group based execution
- Best for parallel processing tasks

### Comparison Matrix

| Feature | GLSL TOP | GLSL MAT | Compute TOP |
|---------|----------|----------|-------------|
| Vertex Shader | Auto | Yes | N/A |
| Fragment Shader | Yes | Yes | N/A |
| Geometry Shader | No | Yes | N/A |
| Compute Shader | No | No | Yes |
| 3D Rendering | No | Yes | No |
| Image Processing | Yes | Limited | Yes |
| Multi-texture Output | No | Yes | Yes |

## Uniform System

### Auto-Generated Uniforms (Always Available)

```glsl
// GLSL TOP auto uniforms
uniform vec3 uTD2DInfos[9];  // [index]: xy=resolution, z=aspect

// Common extractions:
vec2 resolution = uTD2DInfos[0].xy;
float aspect = uTD2DInfos[0].z;

// GLSL MAT auto uniforms
uniform mat4 uTDMats[6];  // Transform matrices
// [0] = world, [1] = camera, [2] = project
// [3] = worldCam, [4] = worldCamProject, [5] = camProject

uniform vec3 uTDGeneral[1];  // General info
// .x = near, .y = far, .z = aspect

uniform vec3 uTDCamInfos[1];  // Camera info
// .xy = resolution, .z = aspect
```

### Custom Uniform Declaration

```glsl
// Scalar uniforms
uniform float uTime;
uniform int uIterations;
uniform bool uInvert;

// Vector uniforms
uniform vec2 uOffset;
uniform vec3 uColor;
uniform vec4 uParams;  // Pack multiple params

// Texture uniforms
uniform sampler2D sTD2DInputs[8];  // Auto-named texture inputs

// Custom texture uniform (when using Material)
uniform sampler2D sCustomTexture;

// Matrix uniforms
uniform mat4 uTransform;
```

### Uniform Naming Conventions

TD convention (recommended):
- `u` prefix: Uniform values (uTime, uColor)
- `s` prefix: Sampler/texture uniforms (sTD2DInputs, sNoise)
- `a` prefix: Attributes (GLSL MAT) (aPosition, aNormal)
- `v` prefix: Varyings (vTexCoord, vNormal)

### Binding Uniforms from TD

```python
# Method 1: Direct parameter assignment
glsl = op('glsl1')
glsl.par.Uniformname0 = 'uTime'
glsl.par.Value0 = 1.5

# Method 2: CHOP input (better for animated values)
# Connect CHOP to GLSL TOP's uniform page
# Name CHOP channels to match uniform names

# Method 3: DAT for array uniforms
# Connect DAT to uniform page for array data

# Method 4: Python for complex updates
def updateUniforms():
    glsl.par.Utime = absTime.seconds
    glsl.par.Uoffset0 = noise(absTime.frame)
    glsl.par.Uoffset1 = noise(absTime.frame + 100)
```

### Uniform Array Handling

```glsl
// Declare array
uniform vec2 uOffsets[16];

// TD binding requires individual parameters:
// Uoffsets0x, Uoffsets0y, Uoffsets1x, Uoffsets1y, ...
```

```python
# Python to set array uniforms
offsets = [(random.random(), random.random()) for _ in range(16)]
for i, (x, y) in enumerate(offsets):
    glsl.par[f'Uoffsets{i}x'] = x
    glsl.par[f'Uoffsets{i}y'] = y
```

## Texture Input System

### GLSL TOP Texture Inputs

```glsl
// Auto-declared: sTD2DInputs[0] through sTD2DInputs[7]
vec4 tex0 = texture(sTD2DInputs[0], uv);
vec4 tex1 = texture(sTD2DInputs[1], uv);

// Check if input connected
#ifdef TD_NUM_INPUTS
    #if TD_NUM_INPUTS > 0
        vec4 input = texture(sTD2DInputs[0], uv);
    #else
        vec4 input = vec4(0.0);
    #endif
#endif
```

### Texture Sampling Patterns

```glsl
// Standard sample
vec4 color = texture(sTD2DInputs[0], uv);

// With explicit LOD
vec4 color = textureLod(sTD2DInputs[0], uv, lodLevel);

// With gradient (for anisotropic filtering)
vec4 color = textureGrad(sTD2DInputs[0], uv, dFdx(uv), dFdy(uv));

// Offset sampling
vec4 color = textureOffset(sTD2DInputs[0], uv, ivec2(1, 0));

// Size query (requires GLSL 430+)
ivec2 texSize = textureSize(sTD2DInputs[0], 0);
```

### Multi-texture Tricks

```glsl
// Texture array access (when inputs are similar)
vec4 sampleInput(int index, vec2 uv) {
    if(index == 0) return texture(sTD2DInputs[0], uv);
    if(index == 1) return texture(sTD2DInputs[1], uv);
    if(index == 2) return texture(sTD2DInputs[2], uv);
    if(index == 3) return texture(sTD2DInputs[3], uv);
    // ... etc
    return vec4(0.0);
}

// Better: use #defines for readability
#define SOURCE sTD2DInputs[0]
#define NOISE sTD2DInputs[1]
#define DISPLACEMENT sTD2DInputs[2]
```

## GLSL MAT Integration

### Vertex Shader Interface

```glsl
// Vertex shader input (attributes)
in vec3 aPosition;
in vec3 aNormal;
in vec3 aTangent;
in vec2 aTexCoord0;
in vec4 aColor;

// Vertex shader output (varyings)
out vec3 vPosition;
out vec3 vNormal;
out vec2 vTexCoord;
out vec4 vColor;

void main() {
    // Transform position
    vec4 worldPos = uTDMats[0] * vec4(aPosition, 1.0);
    gl_Position = uTDMats[4] * vec4(aPosition, 1.0);
    
    // Pass through to fragment shader
    vPosition = worldPos.xyz;
    vNormal = normalize((uTDMats[0] * vec4(aNormal, 0.0)).xyz);
    vTexCoord = aTexCoord0;
    vColor = aColor;
}
```

### Fragment Shader Interface

```glsl
// Fragment shader input (from vertex shader)
in vec3 vPosition;
in vec3 vNormal;
in vec2 vTexCoord;
in vec4 vColor;

// Fragment shader output
out vec4 fragColor;

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uTDCamInfos[0].xyz - vPosition);
    
    // Material calculations
    vec3 color = calculateLighting(vPosition, normal, viewDir);
    
    fragColor = vec4(color, 1.0);
}
```

### Multiple Render Targets (MRT)

```glsl
// Fragment shader with multiple outputs
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outPosition;

void main() {
    outColor = vec4(calculateColor(), 1.0);
    outNormal = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);
    outPosition = vec4(vPosition, 1.0);
}
```

## Compute Shader Integration

### Basic Compute Structure

```glsl
#version 430

layout(local_size_x = 16, local_size_y = 16) in;

// Image inputs/outputs
layout(rgba8, binding = 0) uniform readonly image2D inputImg;
layout(rgba8, binding = 1) uniform writeonly image2D outputImg;

// Custom uniforms
uniform float uTime;
uniform vec2 uResolution;

void main() {
    ivec2 pixelCoord = ivec2(gl_GlobalInvocationID.xy);
    
    // Bounds check
    if(pixelCoord.x >= int(uResolution.x) || pixelCoord.y >= int(uResolution.y)) {
        return;
    }
    
    // Read input
    vec4 inputColor = imageLoad(inputImg, pixelCoord);
    
    // Process
    vec4 outputColor = processPixel(inputColor, pixelCoord);
    
    // Write output
    imageStore(outputImg, pixelCoord, outputColor);
}
```

### Shared Memory in Compute

```glsl
layout(local_size_x = 16, local_size_y = 16) in;
shared vec4 sharedData[16][16];

void main() {
    ivec2 localID = ivec2(gl_LocalInvocationID.xy);
    ivec2 globalID = ivec2(gl_GlobalInvocationID.xy);
    
    // Load to shared memory
    sharedData[localID.x][localID.y] = imageLoad(inputImg, globalID);
    
    // Synchronize work group
    barrier();
    memoryBarrierShared();
    
    // Now can access neighbors efficiently
    vec4 result = vec4(0.0);
    for(int y = -1; y <= 1; y++) {
        for(int x = -1; x <= 1; x++) {
            int sx = clamp(localID.x + x, 0, 15);
            int sy = clamp(localID.y + y, 0, 15);
            result += sharedData[sx][sy];
        }
    }
    result /= 9.0;
    
    imageStore(outputImg, globalID, result);
}
```

## TD-Specific Quirks and Gotchas

### Quirk 1: Coordinate System
```glsl
// TD uses bottom-left origin (OpenGL standard)
// But many effects expect top-left

// Flip Y if needed:
vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
```

### Quirk 2: sRGB Handling
```glsl
// TD textures may be in sRGB space
// Manual linearization if needed:
vec3 toLinear(vec3 srgb) {
    return pow(srgb, vec3(2.2));
}

vec3 toSRGB(vec3 linear) {
    return pow(linear, vec3(1.0 / 2.2));
}
```

### Quirk 3: Precision Issues
```glsl
// TD defaults to mediump on some platforms
// Force highp for critical calculations:
highp float preciseValue = someCriticalCalc();
```

### Quirk 4: Time Uniforms
```python
# TD doesn't auto-provide time uniform
# Must bind manually:

glsl.par.Uniformname0 = 'uTime'
glsl.par.Value0 = absTime.seconds  # Updates only when set

# Better: use CHOP
timer = op('timer1')
# Connect timer CHOP to GLSL's uniform input
```

### Quirk 5: Texture Resolution Mismatch
```glsl
// Input textures may have different resolutions
// Always normalize coordinates or check size

ivec2 size = textureSize(sTD2DInputs[0], 0);
vec2 normalizedUV = vec2(gl_FragCoord.xy) / vec2(size);
```

### Quirk 6: Feedback Loop Initialization
```python
# First frame of feedback has no previous data
# Initialize properly:

feedback = op('feedback1')
if not feedback.isCached:
    # Render initial state
    op('glsl1').par.Feedbacktex.val = ''
else:
    op('glsl1').par.Feedbacktex.val = 'feedback1'
```

## Advanced Integration Patterns

### Pattern 1: Multi-Pass Effect

```python
# Python DAT for orchestrating passes
def setupMultiPass():
    glsl_blur_h = op('glsl_blur_h')
    glsl_blur_v = op('glsl_blur_v')
    glsl_composite = op('glsl_composite')
    
    # Pass 1: Horizontal blur
    glsl_blur_h.par.Inputtop = 'source'
    
    # Pass 2: Vertical blur (uses Pass 1 output)
    glsl_blur_v.par.Inputtop = glsl_blur_h
    
    # Pass 3: Composite with original
    glsl_composite.par.Inputtop0 = 'source'
    glsl_composite.par.Inputtop1 = glsl_blur_v
```

### Pattern 2: Dynamic Shader Generation

```python
# Generate shader code based on parameters
def generateShader(effectType, params):
    base_shader = """
    out vec4 fragColor;
    uniform sampler2D sTD2DInputs[1];
    void main() {
        vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
        vec4 color = texture(sTD2DInputs[0], uv);
        {EFFECT_CODE}
        fragColor = color;
    }
    """
    
    if effectType == 'blur':
        effect = """
        // Blur effect code
        """
    elif effectType == 'distort':
        effect = """
        // Distort effect code
        """
    
    return base_shader.replace('{EFFECT_CODE}', effect)

# Apply to GLSL TOP
glsl = op('glsl1')
glsl.par.Fragmentshader = generateShader('blur', {'radius': 5})
```

### Pattern 3: Shader Library System

```python
# Load shader snippets from external files
def loadShaderSnippet(name):
    dat = op(f'shader_library/{name}')
    return dat.text

# Compose final shader
vertex = loadShaderSnippet('vertex_base')
fragment_header = loadShaderSnippet('fragment_header')
fragment_noise = loadShaderSnippet('noise_functions')
fragment_main = loadShaderSnippet('fragment_main')

final_shader = f"""
{fragment_header}
{fragment_noise}
{fragment_main}
"""

op('glsl1').par.Fragmentshader = final_shader
```

### Pattern 4: Parameter Mapping Helper

```python
# Auto-map CHOP channels to shader uniforms
def autoMapUniforms(glsl_op, chop_op):
    for i, chan in enumerate(chop_op.chans()):
        glsl_op.par[f'Uniformname{i}'] = f'u{chan.name.capitalize()}'
        glsl_op.par[f'Valueindex{i}'] = chop_op
        glsl_op.par[f'Valuename{i}'] = chan.name

# Usage
autoMapUniforms(op('glsl1'), op('controls'))
```

## Debugging TD Shaders

### Error Messages
```python
# Check compilation errors
glsl = op('glsl1')
if glsl.errors:
    print(f"Shader errors: {glsl.errors}")

# Common TD error messages:
# "Failed to compile shader" - syntax error
# "Failed to link program" - uniform/varying mismatch
# "Texture unit N not bound" - missing texture input
```

### Debug Visualization
```glsl
// Output debug values as colors
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Visualize UV coordinates
    fragColor = vec4(uv, 0.0, 1.0);
    
    // Visualize normal
    // fragColor = vec4(vNormal * 0.5 + 0.5, 1.0);
    
    // Visualize depth
    // fragColor = vec4(vec3(gl_FragCoord.z), 1.0);
}
```

### Printf-Style Debugging
```glsl
// Use color channels to output intermediate values
vec4 debugOutput = vec4(0.0);
debugOutput.r = intermediateValue1;
debugOutput.g = intermediateValue2;
debugOutput.b = intermediateValue3;
fragColor = debugOutput;

// View in TD with Analyze TOP to see exact values
```

## Performance Monitoring

```python
# Script to monitor shader performance
import time

class ShaderProfiler:
    def __init__(self, glsl_op):
        self.op = glsl_op
        self.samples = []
    
    def profile(self, frames=100):
        for _ in range(frames):
            self.op.cook(force=True)
            self.samples.append(self.op.cookTime)
        
        avg = sum(self.samples) / len(self.samples)
        max_time = max(self.samples)
        min_time = min(self.samples)
        
        print(f"Avg: {avg:.2f}ms, Min: {min_time:.2f}ms, Max: {max_time:.2f}ms")
        return avg

# Usage
profiler = ShaderProfiler(op('glsl1'))
profiler.profile()
```

## Best Practices Summary

1. **Uniform Management**: Use CHOPs for animated values, Python for complex logic
2. **Texture Inputs**: Always check resolution, handle missing inputs gracefully
3. **Coordinate Systems**: Be aware of TD's bottom-left origin
4. **Multi-Pass**: Decompose complex effects into simpler passes
5. **Error Handling**: Always check for compilation errors in Python
6. **Performance**: Profile with Performance Monitor, optimize bottlenecks
7. **Naming**: Follow TD conventions (u/s/a/v prefixes)
8. **Version**: Use GLSL 330+ for GLSL TOP, 430+ for Compute
9. **Debugging**: Visualize intermediate values as colors
10. **Organization**: Keep shader library in Text DATs for reusability
