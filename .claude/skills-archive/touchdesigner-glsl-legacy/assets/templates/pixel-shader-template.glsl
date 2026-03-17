#version 330

// ============================================================================
// TOUCHDESIGNER PIXEL/FRAGMENT SHADER TEMPLATE
// ============================================================================
// This template provides a starting point for GLSL TOP fragment shaders
// with common uniforms, helper functions, and best practices.
//
// Usage: Copy this template and modify the main() function for your effect
// ============================================================================

// ----------------------------------------------------------------------------
// OUTPUTS
// ----------------------------------------------------------------------------
out vec4 fragColor;

// ----------------------------------------------------------------------------
// AUTO-GENERATED TD UNIFORMS (Always Available)
// ----------------------------------------------------------------------------
// uTD2DInfos[0].xy = resolution
// uTD2DInfos[0].z  = aspect ratio

// ----------------------------------------------------------------------------
// TEXTURE INPUTS
// ----------------------------------------------------------------------------
// TD auto-declares: sTD2DInputs[0] through sTD2DInputs[7]
// Connect textures via the GLSL TOP's input parameters

// ----------------------------------------------------------------------------
// CUSTOM UNIFORMS
// ----------------------------------------------------------------------------
// Add your custom uniforms here and bind them in TD's uniform parameters

uniform float uTime;           // Time in seconds (bind to absTime.seconds)
uniform vec2 uMouse;          // Mouse position (normalized 0-1)
uniform vec2 uResolution;     // Explicit resolution (if needed)

// Effect parameters
uniform float uIntensity;     // Effect intensity (0-1)
uniform vec3 uColor;          // Color tint
uniform bool uInvert;         // Invert effect

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

// Convert pixel coordinates to UV (0-1)
vec2 getUV() {
    return gl_FragCoord.xy / uTD2DInfos[0].xy;
}

// Convert UV to centered coordinates (-1 to 1)
vec2 getCenteredUV() {
    vec2 uv = getUV();
    return (uv - 0.5) * 2.0;
}

// Aspect-corrected UV (square pixels)
vec2 getAspectUV() {
    vec2 uv = getUV();
    uv.x *= uTD2DInfos[0].z;  // Multiply by aspect ratio
    return uv;
}

// Safe texture sampling (handles out-of-bounds)
vec4 safeSample(sampler2D tex, vec2 uv) {
    if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(0.0);
    }
    return texture(tex, uv);
}

// Rotate UV around center
vec2 rotateUV(vec2 uv, float angle) {
    vec2 centered = uv - 0.5;
    float s = sin(angle);
    float c = cos(angle);
    mat2 rotation = mat2(c, -s, s, c);
    return rotation * centered + 0.5;
}

// Simple noise function (hash-based)
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth noise
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// ----------------------------------------------------------------------------
// EFFECT FUNCTIONS
// ----------------------------------------------------------------------------

// Example: Simple color manipulation
vec3 processColor(vec3 color) {
    // Apply tint
    color *= uColor;
    
    // Apply intensity
    color = mix(vec3(0.5), color, uIntensity);
    
    // Optional invert
    if(uInvert) {
        color = 1.0 - color;
    }
    
    return color;
}

// Example: UV distortion
vec2 distortUV(vec2 uv) {
    float strength = 0.1 * uIntensity;
    float offsetX = noise(uv * 5.0 + uTime) * strength;
    float offsetY = noise(uv * 5.0 + uTime + 100.0) * strength;
    return uv + vec2(offsetX, offsetY);
}

// ----------------------------------------------------------------------------
// MAIN SHADER
// ----------------------------------------------------------------------------
void main() {
    // Get UV coordinates
    vec2 uv = getUV();
    
    // ========================================================================
    // YOUR EFFECT CODE HERE
    // ========================================================================
    
    // Example: Sample input texture with distortion
    vec2 distortedUV = distortUV(uv);
    vec4 color = texture(sTD2DInputs[0], distortedUV);
    
    // Process color
    color.rgb = processColor(color.rgb);
    
    // ========================================================================
    // END EFFECT CODE
    // ========================================================================
    
    // Output final color
    fragColor = color;
}

// ============================================================================
// COMMON PATTERNS & SNIPPETS
// ============================================================================

/* 
// PATTERN: Multi-input blending
vec4 tex0 = texture(sTD2DInputs[0], uv);
vec4 tex1 = texture(sTD2DInputs[1], uv);
vec4 blended = mix(tex0, tex1, uIntensity);
fragColor = blended;
*/

/*
// PATTERN: Chromatic aberration
vec2 offset = (uv - 0.5) * 0.01 * uIntensity;
float r = texture(sTD2DInputs[0], uv + offset).r;
float g = texture(sTD2DInputs[0], uv).g;
float b = texture(sTD2DInputs[0], uv - offset).b;
fragColor = vec4(r, g, b, 1.0);
*/

/*
// PATTERN: Vignette
vec2 centered = uv * 2.0 - 1.0;
float vignette = 1.0 - dot(centered, centered) * 0.3;
vec4 color = texture(sTD2DInputs[0], uv);
fragColor = color * vignette;
*/

/*
// PATTERN: Time-based animation
float wave = sin(uv.x * 10.0 + uTime * 2.0) * 0.5 + 0.5;
vec4 color = texture(sTD2DInputs[0], uv);
fragColor = color * wave;
*/

/*
// PATTERN: Debug visualization
// Visualize UV coordinates
fragColor = vec4(uv, 0.0, 1.0);
// Visualize time
// fragColor = vec4(vec3(fract(uTime)), 1.0);
// Visualize mouse position
// fragColor = vec4(uMouse, 0.0, 1.0);
*/
