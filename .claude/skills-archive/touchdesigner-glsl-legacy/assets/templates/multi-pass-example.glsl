// ============================================================================
// MULTI-PASS SHADER WORKFLOW EXAMPLE
// ============================================================================
// This file demonstrates how to structure multi-pass effects in TouchDesigner
// Each pass is a separate GLSL TOP with specific purpose
// ============================================================================

// ============================================================================
// PASS 1: DOWNSAMPLE
// ============================================================================
// Purpose: Reduce resolution for expensive operations
// Input: Full resolution source
// Output: Half resolution
// ----------------------------------------------------------------------------

#ifdef PASS_DOWNSAMPLE

#version 330
out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Bilinear downsample
    vec2 texelSize = 1.0 / uTD2DInfos[0].xy;
    vec4 color = vec4(0.0);
    
    // 2x2 box filter
    color += texture(sTD2DInputs[0], uv + vec2(-0.5, -0.5) * texelSize);
    color += texture(sTD2DInputs[0], uv + vec2(0.5, -0.5) * texelSize);
    color += texture(sTD2DInputs[0], uv + vec2(-0.5, 0.5) * texelSize);
    color += texture(sTD2DInputs[0], uv + vec2(0.5, 0.5) * texelSize);
    
    fragColor = color * 0.25;
}

#endif

// ============================================================================
// PASS 2: HORIZONTAL BLUR
// ============================================================================
// Purpose: First pass of separable gaussian blur
// Input: Downsampled image
// Output: Horizontally blurred
// ----------------------------------------------------------------------------

#ifdef PASS_BLUR_H

#version 330
out vec4 fragColor;

uniform float uBlurRadius;

void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    vec2 texelSize = 1.0 / uTD2DInfos[0].xy;
    
    // Gaussian weights (5-tap)
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    
    vec4 result = texture(sTD2DInputs[0], uv) * weights[0];
    
    for(int i = 1; i < 5; i++) {
        float offset = float(i) * texelSize.x * uBlurRadius;
        result += texture(sTD2DInputs[0], uv + vec2(offset, 0.0)) * weights[i];
        result += texture(sTD2DInputs[0], uv - vec2(offset, 0.0)) * weights[i];
    }
    
    fragColor = result;
}

#endif

// ============================================================================
// PASS 3: VERTICAL BLUR
// ============================================================================
// Purpose: Second pass of separable gaussian blur
// Input: Horizontally blurred image
// Output: Fully blurred
// ----------------------------------------------------------------------------

#ifdef PASS_BLUR_V

#version 330
out vec4 fragColor;

uniform float uBlurRadius;

void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    vec2 texelSize = 1.0 / uTD2DInfos[0].xy;
    
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    
    vec4 result = texture(sTD2DInputs[0], uv) * weights[0];
    
    for(int i = 1; i < 5; i++) {
        float offset = float(i) * texelSize.y * uBlurRadius;
        result += texture(sTD2DInputs[0], uv + vec2(0.0, offset)) * weights[i];
        result += texture(sTD2DInputs[0], uv - vec2(0.0, offset)) * weights[i];
    }
    
    fragColor = result;
}

#endif

// ============================================================================
// PASS 4: UPSAMPLE
// ============================================================================
// Purpose: Return to original resolution
// Input: Blurred low-res image
// Output: Full resolution blurred
// ----------------------------------------------------------------------------

#ifdef PASS_UPSAMPLE

#version 330
out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Simple bilinear upsample (TD handles filtering)
    fragColor = texture(sTD2DInputs[0], uv);
}

#endif

// ============================================================================
// PASS 5: COMPOSITE
// ============================================================================
// Purpose: Combine original with blurred (bloom effect)
// Input 0: Original full-res image
// Input 1: Upsampled blur
// Output: Final composited image
// ----------------------------------------------------------------------------

#ifdef PASS_COMPOSITE

#version 330
out vec4 fragColor;

uniform float uBloomIntensity;
uniform float uBloomThreshold;
uniform vec3 uTint;

// Tone mapping
vec3 reinhardTonemap(vec3 color) {
    return color / (color + vec3(1.0));
}

void main() {
    vec2 uv = gl_FragCoord.xy / uTD2DInfos[0].xy;
    
    // Sample both inputs
    vec4 original = texture(sTD2DInputs[0], uv);
    vec4 bloom = texture(sTD2DInputs[1], uv);
    
    // Apply threshold to bloom
    vec3 bloomContribution = max(bloom.rgb - uBloomThreshold, 0.0) * uBloomIntensity;
    bloomContribution *= uTint;
    
    // Combine
    vec3 finalColor = original.rgb + bloomContribution;
    
    // Optional tone mapping
    finalColor = reinhardTonemap(finalColor);
    
    fragColor = vec4(finalColor, original.a);
}

#endif

// ============================================================================
// PYTHON ORCHESTRATION (TD)
// ============================================================================
/*
# Create multi-pass network in TouchDesigner
# Place this in a Python DAT

def setupMultiPassBloom():
    # Clear existing network (optional)
    # ...
    
    # Create operators
    source = op('source')  # Original image
    
    # Pass 1: Downsample
    downsample = parent().create(baseCOMP.GLSL, 'downsample')
    downsample.par.resolution = '960 540'  # Half res
    downsample.par.inputop = source
    downsample.par.pixelformat = 'rgba16float'
    
    # Pass 2: Blur H
    blur_h = parent().create(baseCOMP.GLSL, 'blur_h')
    blur_h.par.inputop = downsample
    blur_h.par.Uniformname0 = 'uBlurRadius'
    blur_h.par.Value0 = 1.0
    
    # Pass 3: Blur V
    blur_v = parent().create(baseCOMP.GLSL, 'blur_v')
    blur_v.par.inputop = blur_h
    blur_v.par.Uniformname0 = 'uBlurRadius'
    blur_v.par.Value0 = 1.0
    
    # Pass 4: Upsample
    upsample = parent().create(baseCOMP.GLSL, 'upsample')
    upsample.par.resolution = '1920 1080'  # Full res
    upsample.par.inputop = blur_v
    
    # Pass 5: Composite
    composite = parent().create(baseCOMP.GLSL, 'composite')
    composite.par.inputop0 = source
    composite.par.inputop1 = upsample
    composite.par.Uniformname0 = 'uBloomIntensity'
    composite.par.Value0 = 1.0
    composite.par.Uniformname1 = 'uBloomThreshold'
    composite.par.Value1 = 0.8
    
    # Position operators for clean layout
    downsample.nodeX = source.nodeX + 200
    blur_h.nodeX = downsample.nodeX + 200
    blur_v.nodeX = blur_h.nodeX + 200
    upsample.nodeX = blur_v.nodeX + 200
    composite.nodeX = upsample.nodeX + 200
    
    print("Multi-pass bloom network created!")

# Run setup
setupMultiPassBloom()
*/

// ============================================================================
// ALTERNATIVE: COMPONENT-BASED APPROACH
// ============================================================================
/*
# Create a reusable component for multi-pass effects

class MultiPassEffect:
    def __init__(self, name, parent):
        self.name = name
        self.parent = parent
        self.passes = []
        
    def addPass(self, pass_name, shader_code, resolution=None):
        glsl = self.parent.create(baseCOMP.GLSL, f'{self.name}_{pass_name}')
        
        if resolution:
            glsl.par.resolution = f'{resolution[0]} {resolution[1]}'
        
        glsl.par.pixelformat = 'rgba16float'
        
        # Link to previous pass
        if self.passes:
            glsl.par.inputop = self.passes[-1]
        
        self.passes.append(glsl)
        return glsl
    
    def setUniform(self, pass_index, name, value):
        pass_op = self.passes[pass_index]
        # Find free uniform slot
        for i in range(24):
            if not pass_op.par[f'Uniformname{i}'].eval():
                pass_op.par[f'Uniformname{i}'] = name
                pass_op.par[f'Value{i}'] = value
                break
    
    def getOutput(self):
        return self.passes[-1] if self.passes else None

# Usage:
effect = MultiPassEffect('bloom', parent())
effect.addPass('downsample', downsample_shader, (960, 540))
effect.addPass('blur_h', blur_h_shader)
effect.addPass('blur_v', blur_v_shader)
effect.addPass('upsample', upsample_shader, (1920, 1080))
effect.setUniform(1, 'uBlurRadius', 1.0)
*/

// ============================================================================
// OPTIMIZATION TIPS FOR MULTI-PASS
// ============================================================================
/*
1. Resolution Management:
   - Downsample early for expensive operations
   - Use 50% resolution for blur (saves 75% of samples)
   - Keep original resolution for final composite
   
2. Pixel Format:
   - Use rgba8 for final output
   - Use rgba16float for intermediate passes (HDR)
   - Only use rgba32float when absolutely necessary
   
3. Separable Filters:
   - Always separate 2D filters into 1D passes
   - NxN samples becomes 2N samples (huge savings)
   - Examples: Gaussian blur, box blur, motion blur
   
4. Pass Ordering:
   - Downsample -> Process -> Upsample
   - Cheap operations at full res
   - Expensive operations at lower res
   
5. Feedback Loops:
   - Use Feedback TOP or explicit feedback connections
   - Always initialize properly (first frame handling)
   - Be careful with accumulation (can blow up)
   
6. Caching:
   - Use Null TOPs to cache intermediate results
   - Prevents redundant calculations
   - Helps with debugging (can view each pass)
*/

// ============================================================================
// COMMON MULTI-PASS PATTERNS
// ============================================================================

// PATTERN: Ping-Pong Feedback
/*
Python:
frame = root.time.frame

if frame % 2 == 0:
    feedback_source = op('feedback_a')
    feedback_target = op('feedback_b')
else:
    feedback_source = op('feedback_b')
    feedback_target = op('feedback_a')

op('process').par.inputop = feedback_source
feedback_target.copy(op('process'))
*/

// PATTERN: Progressive Blur (Multiple Passes)
/*
blur_passes = 5
current = op('source')

for i in range(blur_passes):
    blur = parent().create(baseCOMP.GLSL, f'blur_{i}')
    blur.par.inputop = current
    # Apply blur shader
    current = blur
*/

// PATTERN: Multi-Scale Processing (Image Pyramid)
/*
# Create pyramid of resolutions
scales = [(1920, 1080), (960, 540), (480, 270), (240, 135)]
pyramid = []

for i, (w, h) in enumerate(scales):
    downsample = parent().create(baseCOMP.GLSL, f'scale_{i}')
    downsample.par.resolution = f'{w} {h}'
    downsample.par.inputop = pyramid[-1] if pyramid else op('source')
    pyramid.append(downsample)

# Now process each scale independently and combine
*/
