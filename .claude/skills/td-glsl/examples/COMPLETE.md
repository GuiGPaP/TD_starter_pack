# Complete Shader Examples

Full, production-ready shaders demonstrating best practices.

## 1. Kaleidoscope Effect

Radial symmetry with configurable segments and rotation.

```glsl
// UNIFORMS
uniform float uSegments;     // Number of mirror segments (4-16)
uniform float uRotation;     // Rotation offset in radians
uniform float uZoom;         // Zoom level (0.5-2.0)
uniform float uTime;

// CONSTANTS
const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// HELPER FUNCTIONS
vec2 toPolar(vec2 cartesian) {
    return vec2(atan(cartesian.y, cartesian.x), length(cartesian));
}

vec2 toCartesian(vec2 polar) {
    return polar.y * vec2(cos(polar.x), sin(polar.x));
}

vec2 kaleidoscope(vec2 uv, float segments, float time) {
    vec2 polar = toPolar(uv);

    float angle = polar.x + uRotation + time;
    float segmentAngle = TAU / segments;
    angle = mod(angle, segmentAngle);

    // Mirror every other segment
    float segment = floor((polar.x + uRotation) / segmentAngle);
    if(mod(segment, 2.0) > 0.5) {
        angle = segmentAngle - angle;
    }

    return toCartesian(vec2(angle, polar.y));
}

out vec4 fragColor;

void main() {
    vec2 uv = (vUV.st - 0.5) * uZoom;
    vec2 kaleido = kaleidoscope(uv, uSegments, uTime);
    vec4 color = texture(sTD2DInputs[0], kaleido + 0.5);
    fragColor = TDOutputSwizzle(color);
}
```

**TouchDesigner Setup**:
- Vectors 1 -> `uSegments` (float) = `8.0`
- Vectors 2 -> `uRotation` (float) = `0.0`
- Vectors 3 -> `uZoom` (float) = `1.0`
- Vectors 4 -> `uTime` (float) = `absTime.seconds`

---

## 2. Edge Detection (Sobel Filter)

Extracts edges from an input texture using the Sobel operator — a classic post-processing effect.

```glsl
// UNIFORMS
uniform float uStrength;    // Edge visibility (1.0-5.0)
uniform float uThreshold;   // Edge cutoff (0.0-0.5)

out vec4 fragColor;

void main() {
    vec2 texelSize = 1.0 / vec2(textureSize(sTD2DInputs[0], 0));
    vec2 uv = vUV.st;

    // Cache 3x3 neighborhood as luminance
    // The Cache-and-Reuse Pattern: sample once, use many times
    float tl = dot(texture(sTD2DInputs[0], uv + vec2(-1, 1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(sTD2DInputs[0], uv + vec2( 0, 1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(sTD2DInputs[0], uv + vec2( 1, 1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(sTD2DInputs[0], uv + vec2(-1, 0) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(sTD2DInputs[0], uv + vec2( 1, 0) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(sTD2DInputs[0], uv + vec2(-1,-1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(sTD2DInputs[0], uv + vec2( 0,-1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(sTD2DInputs[0], uv + vec2( 1,-1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));

    // Sobel kernels applied to cached values
    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = length(vec2(gx, gy)) * uStrength;
    edge = smoothstep(uThreshold, uThreshold + 0.1, edge);

    fragColor = TDOutputSwizzle(vec4(vec3(edge), 1.0));
}
```

**TouchDesigner Setup**:
- Vectors 1 -> `uStrength` (float) = `2.0`
- Vectors 2 -> `uThreshold` (float) = `0.1`

---

## 3. Reaction-Diffusion System

Gray-Scott model for organic pattern formation. Requires a Feedback TOP loop.

```glsl
// UNIFORMS
uniform float uDiffusionA;      // Diffusion rate A (default 0.2)
uniform float uDiffusionB;      // Diffusion rate B (default 0.1)
uniform float uFeedRate;        // Feed rate (default 0.055)
uniform float uKillRate;        // Kill rate (default 0.062)
uniform float uDeltaTime;       // Time step (default 1.0)

vec2 laplacian(vec2 uv, sampler2D tex, vec2 texelSize) {
    vec2 sum = vec2(0.0);

    sum += texture(tex, uv + vec2(-1, -1) * texelSize).xy * 0.05;
    sum += texture(tex, uv + vec2( 0, -1) * texelSize).xy * 0.2;
    sum += texture(tex, uv + vec2( 1, -1) * texelSize).xy * 0.05;
    sum += texture(tex, uv + vec2(-1,  0) * texelSize).xy * 0.2;
    sum += texture(tex, uv + vec2( 0,  0) * texelSize).xy * -1.0;
    sum += texture(tex, uv + vec2( 1,  0) * texelSize).xy * 0.2;
    sum += texture(tex, uv + vec2(-1,  1) * texelSize).xy * 0.05;
    sum += texture(tex, uv + vec2( 0,  1) * texelSize).xy * 0.2;
    sum += texture(tex, uv + vec2( 1,  1) * texelSize).xy * 0.05;

    return sum;
}

out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;
    vec2 texelSize = 1.0 / vec2(textureSize(sTD2DInputs[0], 0));

    vec2 state = texture(sTD2DInputs[0], uv).xy;
    float a = state.x;
    float b = state.y;

    vec2 lap = laplacian(uv, sTD2DInputs[0], texelSize);

    float reaction = a * b * b;
    float da = (uDiffusionA * lap.x) - reaction + (uFeedRate * (1.0 - a));
    float db = (uDiffusionB * lap.y) + reaction - ((uKillRate + uFeedRate) * b);

    a += da * uDeltaTime;
    b += db * uDeltaTime;

    fragColor = TDOutputSwizzle(vec4(b, b, b, 1.0));
}
```

**TouchDesigner Setup**:
- Vectors 1 -> `uDiffusionA` (float) = `0.2`
- Vectors 2 -> `uDiffusionB` (float) = `0.1`
- Vectors 3 -> `uFeedRate` (float) = `0.055`
- Vectors 4 -> `uKillRate` (float) = `0.062`
- Vectors 5 -> `uDeltaTime` (float) = `1.0`
- Connect output to Feedback TOP, feed back as input 0

---

## 4. Advanced Color Grading

Professional lift/gamma/gain color correction pipeline.

```glsl
// UNIFORMS
uniform float uExposure;        // EV adjustment (-2 to 2)
uniform float uContrast;        // Contrast (0.5 to 2.0)
uniform float uSaturation;      // Saturation (0 to 2.0)
uniform float uTemperature;     // Color temperature (-1 to 1)
uniform vec3 uLift;             // Shadows adjustment
uniform vec3 uGamma;            // Midtones adjustment
uniform vec3 uGain;             // Highlights adjustment

const vec3 LUMINANCE_WEIGHTS = vec3(0.299, 0.587, 0.114);

vec3 adjustExposure(vec3 color, float exposure) {
    return color * pow(2.0, exposure);
}

vec3 liftGammaGain(vec3 color, vec3 lift, vec3 gamma, vec3 gain) {
    vec3 liftAdjusted = color + lift;
    vec3 gammaAdjusted = pow(max(liftAdjusted, vec3(0.0)), 1.0 / gamma);
    return gammaAdjusted * gain;
}

out vec4 fragColor;

void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);

    color.rgb = adjustExposure(color.rgb, uExposure);
    color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

    // Temperature: warm adds red, cool adds blue
    vec3 warm = vec3(1.0 + uTemperature * 0.5, 1.0 + uTemperature * 0.2, 1.0 - uTemperature * 0.5);
    color.rgb *= warm;

    float luminance = dot(color.rgb, LUMINANCE_WEIGHTS);
    color.rgb = mix(vec3(luminance), color.rgb, uSaturation);

    color.rgb = liftGammaGain(color.rgb, uLift, uGamma, uGain);
    color.rgb = clamp(color.rgb, 0.0, 1.0);

    fragColor = TDOutputSwizzle(color);
}
```

**TouchDesigner Setup**:
- Vectors 1 -> `uExposure` (float) = `0.0`
- Vectors 2 -> `uContrast` (float) = `1.0`
- Vectors 3 -> `uSaturation` (float) = `1.0`
- Vectors 4 -> `uTemperature` (float) = `0.0`
- Colors 1 -> `uLift` (vec3) = `0.0, 0.0, 0.0`
- Colors 2 -> `uGamma` (vec3) = `1.0, 1.0, 1.0`
- Colors 3 -> `uGain` (vec3) = `1.0, 1.0, 1.0`

---

## 5. Signed Distance Field Renderer

Raymarched 3D shapes rendered as a 2D pixel shader.

```glsl
// UNIFORMS
uniform float uTime;
uniform vec3 uCameraPos;
uniform float uAspect;

const int MAX_STEPS = 100;
const float MAX_DIST = 100.0;
const float SURF_DIST = 0.001;

float sdSphere(vec3 p, float radius) {
    return length(p) - radius;
}

float sdBox(vec3 p, vec3 size) {
    vec3 q = abs(p) - size;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float scene(vec3 p) {
    vec3 spherePos = vec3(sin(uTime) * 2.0, 0.0, 0.0);
    float sphere = sdSphere(p - spherePos, 1.0);
    float box = sdBox(p, vec3(0.8));

    // Smooth union
    float k = 0.5;
    float h = clamp(0.5 + 0.5 * (box - sphere) / k, 0.0, 1.0);
    return mix(box, sphere, h) - k * h * (1.0 - h);
}

float raymarch(vec3 ro, vec3 rd) {
    float dist = 0.0;
    for(int i = 0; i < MAX_STEPS; i++) {
        float d = scene(ro + rd * dist);
        dist += d;
        if(d < SURF_DIST || dist > MAX_DIST) break;
    }
    return dist;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(scene(p) - vec3(
        scene(p - e.xyy), scene(p - e.yxy), scene(p - e.yyx)
    ));
}

out vec4 fragColor;

void main() {
    vec2 uv = (vUV.st - 0.5) * 2.0;
    uv.x *= uAspect;

    vec3 ro = uCameraPos;
    vec3 rd = normalize(vec3(uv, 1.0));

    float dist = raymarch(ro, rd);
    vec3 color = vec3(0.0);

    if(dist < MAX_DIST) {
        vec3 p = ro + rd * dist;
        vec3 n = getNormal(p);
        vec3 lightDir = normalize(vec3(1.0, 1.0, -1.0));
        color = vec3(max(dot(n, lightDir), 0.0));
    }

    fragColor = TDOutputSwizzle(vec4(color, 1.0));
}
```

**TouchDesigner Setup**:
- Vectors 1 -> `uTime` (float) = `absTime.seconds`
- Vectors 2 -> `uCameraPos` (vec3) = `0.0, 0.0, -5.0`
- Vectors 3 -> `uAspect` (float) = `me.width / me.height`
