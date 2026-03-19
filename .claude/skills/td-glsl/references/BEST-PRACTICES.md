# GLSL Best Practices for TouchDesigner

Optimization, organization, and workflow guidelines for pixel shaders.

## Code Organization

Recommended file structure for every GLSL TOP shader:

```glsl
// 1. UNIFORMS
uniform float uTime;
uniform vec2 uResolution;

// 2. CONSTANTS
const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// 3. HELPER FUNCTIONS
float remap(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// 4. OUTPUT DECLARATION
out vec4 fragColor;

// 5. MAIN FUNCTION
void main() {
    vec4 color = vec4(1.0);
    fragColor = TDOutputSwizzle(color);
}
```

### Naming Conventions

- **Uniforms**: `uTime`, `uColor`, `uAspect` (prefix `u`)
- **Constants**: `PI`, `TAU`, `MAX_STEPS` (UPPER_CASE)
- **Functions**: `calculateNoise`, `applyGrade` (camelCase)
- **Variables**: `texCoord`, `distFromCenter` (camelCase)

---

## Performance Optimization

### The Cache-and-Reuse Pattern

Each `texture()` call is expensive. When you need the same pixel's data multiple times, sample once and reuse.

```glsl
// BAD — samples the SAME UV twice, wastes a texture fetch
vec3 rgb = texture(sTD2DInputs[0], uv).rgb;
float alpha = texture(sTD2DInputs[0], uv).a;

// GOOD — one sample, access components from the cached result
vec4 cached = texture(sTD2DInputs[0], uv);
vec3 rgb = cached.rgb;
float alpha = cached.a;
```

For convolution kernels, cache all neighborhood samples into variables before applying weights.

### Avoid Branching

GPUs execute both branches and discard one. Use branchless alternatives:

```glsl
// SLOW — conditional branch
if(uv.x > 0.5) {
    color = red;
} else {
    color = blue;
}

// FAST — branchless mix/step
color = mix(blue, red, step(0.5, uv.x));
```

**When conditionals are okay**: uniform-based switches (compiled away), early termination in raymarchers.

### Loop Optimization

```glsl
// SLOW — dynamic loop bound prevents unrolling
for(int i = 0; i < iterations; i++) { ... }

// FAST — fixed bound, compiler can unroll
for(int i = 0; i < 10; i++) { ... }
```

### Math Optimization

```glsl
// Use built-ins — they map to GPU hardware instructions
float dist = length(vec2(x, y));     // not sqrt(x*x + y*y)
float sq = value * value;            // not pow(value, 2.0)
```

Precompute constants outside the shader when possible:
```glsl
const float DEG_TO_RAD = PI / 180.0;
float angle = uTime * DEG_TO_RAD;   // not uTime * 3.14159 / 180.0
```

---

## Precision and Stability

### Safe Division Pattern

```glsl
// DANGEROUS — division by zero produces Inf/NaN
float result = value / denominator;

// SAFE — clamp denominator away from zero
float result = value / max(denominator, 0.0001);
```

### Safe Normalize Pattern

```glsl
// DANGEROUS — normalize(vec2(0.0)) is undefined
vec2 dir = normalize(toCenter);

// SAFE — guard with length check
float len = length(toCenter);
vec2 dir = len > 0.0 ? toCenter / len : vec2(0.0);
```

---

## Debugging Strategies

### Visual Debugging

Output intermediate values as colors to inspect them:

```glsl
// Visualize UV coordinates (should show red-green gradient)
fragColor = TDOutputSwizzle(vec4(vUV.st, 0.0, 1.0));

// Visualize a distance field (bright = far from center)
float dist = length(vUV.st - 0.5);
fragColor = TDOutputSwizzle(vec4(vec3(dist), 1.0));

// Visualize noise range
float noise = TDSimplexNoise(vUV.st * 10.0);
fragColor = TDOutputSwizzle(vec4(vec3(noise), 1.0));
```

### Gradient Test

Start with a simple UV gradient to confirm the shader runs, then add complexity incrementally.

---

## TouchDesigner-Specific Tips

### Use CHOPs for Animated Values

Prefer Speed CHOP over `absTime.seconds` for time uniforms — it keeps computation GPU-side and reduces CPU overhead.

1. Create Speed CHOP (speed: 1.0, play mode: Locked)
2. Reference in GLSL TOP -> CHOP Uniforms -> `uTime`

### Multi-Pass Techniques

For expensive effects (blur, convolution), split into passes:

1. GLSL TOP 1: Horizontal pass
2. GLSL TOP 2: Vertical pass (input = output of #1)

Separable filters run in O(n) per axis instead of O(n^2).
