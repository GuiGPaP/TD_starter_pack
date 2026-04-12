// ============================================
// FEEDBACK LOOP TEMPLATE
// Input 0: current frame source
// Input 1: Feedback TOP (output of this GLSL TOP)
// ============================================

// UNIFORMS
uniform float uDecay;       // Trail persistence (0.9-0.99)
uniform float uMix;         // New frame blend amount (0.05-0.5)
uniform float uTime;

// OUTPUT
out vec4 fragColor;

// MAIN
void main() {
    vec2 uv = vUV.st;

    vec4 current = texture(sTD2DInputs[0], uv);
    vec4 feedback = texture(sTD2DInputs[1], uv);

    // Blend current frame into decaying feedback
    vec4 color = mix(feedback * uDecay, current, uMix);

    fragColor = TDOutputSwizzle(color);
}
