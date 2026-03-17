# Debugging GLSL Shaders in TouchDesigner

Systematic approaches to identifying and fixing shader issues.

## Compilation Error Strategies

### Reading TD Shader Errors

TD error format:
```
0(45) : error C1008: undefined variable "varName"
0(67) : error C0000: syntax error, unexpected '}', expecting ','
```

Format: `0(line_number) : error_code: message`

**Note**: Line numbers include any injected TD code at the top

### Common Compilation Errors

#### Undefined Variable
```
error C1008: undefined variable "uTime"
```
**Causes**:
- Typo in variable name
- Missing uniform declaration
- Variable out of scope

**Fix**:
```glsl
// Add uniform declaration at top
uniform float uTime;
```

#### Syntax Error
```
error C0000: syntax error, unexpected '}', expecting ','
```
**Causes**:
- Missing semicolon
- Mismatched braces
- Invalid token

**Fix**:
```glsl
// BAD
vec3 color = vec3(1.0, 0.0, 0.0)  // Missing semicolon

// GOOD
vec3 color = vec3(1.0, 0.0, 0.0);
```

#### Type Mismatch
```
error C1013: invalid assignment of type 'vec3' to 'float'
```
**Fix**:
```glsl
// BAD
float value = vec3(1.0, 0.0, 0.0);

// GOOD
float value = vec3(1.0, 0.0, 0.0).r;  // Extract component
// OR
vec3 value = vec3(1.0, 0.0, 0.0);     // Match types
```

#### Function Overload
```
error C1115: unable to find compatible overloaded function
```
**Causes**:
- Wrong argument types
- Wrong number of arguments

**Fix**:
```glsl
// BAD
float n = noise(vec3(1.0));  // If noise() expects vec2

// GOOD
float n = noise(vec2(1.0));
```

### Systematic Debugging Process

#### Step 1: Isolate the Problem
```glsl
// Replace entire shader with minimal version
out vec4 fragColor;
void main() {
    fragColor = vec4(1.0, 0.0, 0.0, 1.0);  // Red screen = shader compiles
}
```

If this works, progressively add code back until error returns.

#### Step 2: Binary Search
```glsl
// Comment out half the shader
void main() {
    // First half (commented)
    // vec3 color = complexCalculation();
    
    // Second half (active)
    fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
```

Keep halving until you isolate the problematic line.

#### Step 3: Test Assumptions
```glsl
// Test if uniform is being passed correctly
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Visualize uniform value
    fragColor = vec4(vec3(uTime * 0.1), 1.0);  // Should animate
}
```

### Pre-compilation Validation Script

```python
# Python script to validate shader before applying
import re

def validateShader(shader_code):
    errors = []
    
    # Check for common issues
    lines = shader_code.split('\n')
    
    for i, line in enumerate(lines, 1):
        # Check for missing semicolons
        if line.strip() and not line.strip().endswith((';', '{', '}', '*/')):
            if not line.strip().startswith(('//','#','/*','*')):
                if '=' in line or 'return' in line:
                    errors.append(f"Line {i}: Possible missing semicolon")
        
        # Check for common typos
        if 'sampler2d' in line.lower():  # Should be sampler2D
            errors.append(f"Line {i}: 'sampler2d' should be 'sampler2D'")
        
        # Check for undefined uniforms (basic check)
        if 'uniform' not in shader_code:
            used_vars = re.findall(r'\bu[A-Z]\w+', line)
            for var in used_vars:
                errors.append(f"Line {i}: '{var}' used but not declared")
    
    return errors

# Usage
shader = op('shader_text').text
issues = validateShader(shader)
for issue in issues:
    print(issue)
```

## Runtime Debugging

### Visual Debugging Techniques

#### Technique 1: Color-Code Values
```glsl
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Debug UV coordinates
    fragColor = vec4(uv, 0.0, 1.0);  // R=X, G=Y
    
    // Debug specific channel
    vec4 tex = texture(sTD2DInputs[0], uv);
    fragColor = vec4(tex.aaa, 1.0);  // Visualize alpha channel
}
```

#### Technique 2: Threshold Visualization
```glsl
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    float value = someComplexCalculation(uv);
    
    // Show where value exceeds threshold
    vec3 debug = value > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    fragColor = vec4(debug, 1.0);
}
```

#### Technique 3: Heat Map
```glsl
// Convert scalar to heat map color
vec3 heatMap(float value) {
    vec3 colors[5] = vec3[](
        vec3(0.0, 0.0, 1.0),  // Blue (low)
        vec3(0.0, 1.0, 1.0),  // Cyan
        vec3(0.0, 1.0, 0.0),  // Green
        vec3(1.0, 1.0, 0.0),  // Yellow
        vec3(1.0, 0.0, 0.0)   // Red (high)
    );
    
    value = clamp(value, 0.0, 1.0) * 4.0;
    int idx = int(floor(value));
    float t = fract(value);
    
    if(idx >= 4) return colors[4];
    return mix(colors[idx], colors[idx + 1], t);
}

void main() {
    float debugValue = computeSomething();
    fragColor = vec4(heatMap(debugValue), 1.0);
}
```

#### Technique 4: Split-Screen Debug
```glsl
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    vec3 finalColor = processEffect(uv);
    vec3 debugColor = debugVisualization(uv);
    
    // Split screen: left = debug, right = final
    vec3 output = uv.x < 0.5 ? debugColor : finalColor;
    fragColor = vec4(output, 1.0);
}
```

### Printf-Style Debugging

Since GLSL has no printf, encode values in output:

```glsl
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Encode multiple debug values in RGB channels
    vec4 debugOutput;
    debugOutput.r = debugValue1;     // Red channel
    debugOutput.g = debugValue2;     // Green channel
    debugOutput.b = debugValue3;     // Blue channel
    debugOutput.a = 1.0;
    
    fragColor = debugOutput;
}
```

Use TD's Analyze TOP to read exact pixel values.

### Conditional Debug Mode

```glsl
uniform bool uDebugMode;

void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    vec3 color;
    if(uDebugMode) {
        // Debug visualization
        color = debugView(uv);
    } else {
        // Normal rendering
        color = normalRender(uv);
    }
    
    fragColor = vec4(color, 1.0);
}
```

```python
# Toggle debug mode from Python
op('glsl1').par.Udebugmode = True  # Enable debug
```

## Common Runtime Issues

### Issue: Black Output
**Possible Causes**:
1. Division by zero
2. NaN values
3. Alpha is zero
4. All color channels are zero

**Debug**:
```glsl
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    vec4 color = calculateColor(uv);
    
    // Check for NaN
    if(any(isnan(color))) {
        fragColor = vec4(1.0, 0.0, 1.0, 1.0);  // Magenta = NaN detected
        return;
    }
    
    // Check for division by zero
    if(any(isinf(color))) {
        fragColor = vec4(0.0, 1.0, 1.0, 1.0);  // Cyan = Inf detected
        return;
    }
    
    fragColor = color;
}
```

### Issue: Flickering/Instability
**Possible Causes**:
1. Uninitialized variables
2. Precision issues
3. Feedback loop without proper initialization
4. Race conditions in compute shader

**Debug**:
```glsl
// Force initialization
vec3 color = vec3(0.0);  // Initialize before use

// Use higher precision
highp float preciseValue = criticalCalculation();

// Add epsilon for divisions
float safe = value / max(divisor, 0.0001);
```

### Issue: Seams/Discontinuities
**Possible Causes**:
1. Floating-point precision at boundaries
2. Texture wrap mode issues
3. Incorrect interpolation

**Debug**:
```glsl
// Visualize boundaries
void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Highlight seams
    float seam = step(0.49, uv.x) * step(uv.x, 0.51);
    vec3 color = mix(normalColor(uv), vec3(1.0, 0.0, 0.0), seam);
    
    fragColor = vec4(color, 1.0);
}
```

### Issue: Performance Degradation
**Possible Causes**:
1. Texture fetch in loop
2. Unbounded recursion
3. Complex branching
4. Too many texture samples

**Debug**:
```python
# Python profiler
def profileShader(glsl_op, variants):
    results = {}
    for name, code in variants.items():
        glsl_op.par.Fragmentshader = code
        
        # Warm-up
        for _ in range(10):
            glsl_op.cook(force=True)
        
        # Measure
        times = []
        for _ in range(100):
            glsl_op.cook(force=True)
            times.append(glsl_op.cookTime)
        
        results[name] = {
            'avg': sum(times) / len(times),
            'max': max(times),
            'min': min(times)
        }
    
    return results
```

## TD-Specific Debugging

### Check Operator Connections
```python
# Verify all inputs are connected
glsl = op('glsl1')
for i in range(8):
    input_param = glsl.par[f'Inputtop{i}']
    if input_param.eval():
        print(f"Input {i}: {input_param.eval()}")
    else:
        print(f"Input {i}: Not connected")
```

### Uniform Value Inspection
```python
# Print all active uniforms
glsl = op('glsl1')
for i in range(24):  # Check first 24 uniform slots
    name = glsl.par[f'Uniformname{i}'].eval()
    if name:
        value = glsl.par[f'Value{i}'].eval()
        print(f"Uniform {i}: {name} = {value}")
```

### Texture Resolution Debugging
```python
# Check all input texture resolutions
glsl = op('glsl1')
for i in range(8):
    input_op = glsl.par[f'Inputtop{i}'].eval()
    if input_op:
        top = op(input_op)
        print(f"Input {i} ({input_op}): {top.width}x{top.height}")
```

### Cook Time Analysis
```python
# Monitor cook times over time
import time

class CookMonitor:
    def __init__(self):
        self.history = []
        self.max_history = 1000
    
    def update(self, op_ref):
        cook_time = op_ref.cookTime
        self.history.append({
            'time': time.time(),
            'cook_time': cook_time
        })
        
        if len(self.history) > self.max_history:
            self.history.pop(0)
        
        # Check for spikes
        if len(self.history) > 10:
            recent_avg = sum(h['cook_time'] for h in self.history[-10:]) / 10
            if cook_time > recent_avg * 2:
                print(f"WARNING: Cook time spike! {cook_time:.2f}ms (avg: {recent_avg:.2f}ms)")

# Usage in frame loop
monitor = CookMonitor()

def onFrameStart(frame):
    monitor.update(op('glsl1'))
```

## Advanced Debugging Tools

### Shader Validation Script
```python
# Save as validate_shader.py
import re

def validateGLSL(shader_code):
    """Comprehensive shader validation"""
    
    issues = {
        'errors': [],
        'warnings': [],
        'suggestions': []
    }
    
    lines = shader_code.split('\n')
    
    # Check version
    if not any('#version' in line for line in lines[:5]):
        issues['warnings'].append("No #version directive found")
    
    # Check main function
    if 'void main()' not in shader_code:
        issues['errors'].append("No main() function found")
    
    # Check output declaration (GLSL 330+)
    if 'out vec4' not in shader_code and 'gl_FragColor' not in shader_code:
        issues['errors'].append("No output color declaration")
    
    # Check for common mistakes
    for i, line in enumerate(lines, 1):
        # Swizzle errors
        if re.search(r'\.\w{5,}', line):  # More than 4 component swizzle
            issues['errors'].append(f"Line {i}: Invalid swizzle (max 4 components)")
        
        # Constant array size
        if 'uniform' in line and '[' in line and ']' in line:
            if not re.search(r'\[\d+\]', line):
                issues['warnings'].append(f"Line {i}: Dynamic array size may not be supported")
        
        # Float literals
        if re.search(r'(?<!\.)\.(?!\d)\d+(?![\.\d])', line):
            issues['suggestions'].append(f"Line {i}: Consider using 'f' suffix for float literals")
    
    return issues

# Usage
shader = op('text_shader').text
validation = validateGLSL(shader)

for category, msgs in validation.items():
    if msgs:
        print(f"\n{category.upper()}:")
        for msg in msgs:
            print(f"  {msg}")
```

### Interactive Debugger Component
```python
# Component setup for live shader debugging
# This creates a debug UI in TD

class ShaderDebugger:
    def __init__(self, glsl_op):
        self.glsl = glsl_op
        self.debug_modes = [
            'Normal',
            'UV Coordinates',
            'Normals',
            'Depth',
            'Texture 0',
            'Texture 1'
        ]
    
    def setDebugMode(self, mode):
        """Inject debug code based on mode"""
        
        base_shader = self.glsl.par.Fragmentshader.eval()
        
        # Parse and modify shader
        # (Implementation depends on shader structure)
        
        if mode == 'UV Coordinates':
            debug_inject = """
            // DEBUG: UV Visualization
            fragColor = vec4(vTexCoord, 0.0, 1.0);
            return;
            """
        elif mode == 'Normals':
            debug_inject = """
            // DEBUG: Normal Visualization
            fragColor = vec4(vNormal * 0.5 + 0.5, 1.0);
            return;
            """
        # ... etc
        
        # Apply modified shader
        # (Implementation depends on needs)
```

## Debug Checklist

When shader isn't working:

- [ ] Check TD console for compilation errors
- [ ] Verify all uniforms are declared and bound
- [ ] Check all texture inputs are connected
- [ ] Verify texture resolutions are non-zero
- [ ] Test with minimal shader to isolate issue
- [ ] Visualize intermediate values as colors
- [ ] Check for NaN/Inf values
- [ ] Monitor cook times for performance issues
- [ ] Verify coordinate system assumptions
- [ ] Check precision settings if values seem wrong
- [ ] Test on different resolutions
- [ ] Validate feedback loop initialization

## Common Error Patterns and Solutions

### Pattern 1: "It works in ShaderToy but not in TD"
**Causes**:
- Different uniform names
- Different coordinate system
- Different texture sampling
- ShaderToy-specific features

**Fix**: Use conversion script
```python
def shadertoyToTD(shadertoy_code):
    # Replace common ShaderToy patterns
    td_code = shadertoy_code
    
    # Uniforms
    td_code = td_code.replace('iResolution', 'uTD2DInfos[0].xy')
    td_code = td_code.replace('iTime', 'uTime')
    td_code = td_code.replace('iMouse', 'uMouse')
    
    # Texture sampling
    td_code = td_code.replace('iChannel0', 'sTD2DInputs[0]')
    
    # Output
    td_code = td_code.replace('fragColor', 'out vec4 fragColor;\nvoid main() {')
    
    return td_code
```

### Pattern 2: "Works in editor but breaks in perform mode"
**Causes**:
- Driver/platform differences
- Optimization changes behavior
- Precision reduction

**Solution**: Add safeguards
```glsl
// Epsilon for divisions
const float EPSILON = 0.0001;
float safe = value / max(divisor, EPSILON);

// Clamp outputs
fragColor = clamp(finalColor, 0.0, 1.0);
```

### Pattern 3: "Worked yesterday, broken today"
**Check**:
- TD version updated?
- Driver updated?
- Operator connections changed?
- Parameters reset?

**Solution**: Version control your .toe files and shader code
