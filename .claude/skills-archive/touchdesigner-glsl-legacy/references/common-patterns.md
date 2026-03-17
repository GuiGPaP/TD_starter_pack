# Common GLSL Patterns for TouchDesigner

Quick reference for frequently used shader patterns. All code assumes GLSL 330+ unless noted.

## Noise Functions

### 2D Simplex Noise
```glsl
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}
```

### 3D Simplex Noise
```glsl
float snoise3(vec3 v) { 
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = inversesqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
```

### Value Noise (Fast)
```glsl
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
```

### FBM (Fractal Brownian Motion)
```glsl
float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for(int i = 0; i < octaves; i++) {
        value += amplitude * snoise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}
```

## Distortion Effects

### Domain Warping
```glsl
vec2 domainWarp(vec2 uv, float amount, float time) {
    float warpX = snoise(uv * 3.0 + time) * amount;
    float warpY = snoise(uv * 3.0 + vec2(5.2, 1.3) + time) * amount;
    return uv + vec2(warpX, warpY);
}
```

### Chromatic Aberration
```glsl
vec3 chromaticAberration(sampler2D tex, vec2 uv, float amount) {
    vec2 direction = uv - 0.5;
    float r = texture(tex, uv + direction * amount).r;
    float g = texture(tex, uv).g;
    float b = texture(tex, uv - direction * amount).b;
    return vec3(r, g, b);
}
```

### Lens Distortion (Barrel/Pincushion)
```glsl
vec2 lensDistortion(vec2 uv, float strength) {
    vec2 center = uv - 0.5;
    float dist = length(center);
    float distortion = 1.0 + strength * dist * dist;
    return center * distortion + 0.5;
}
```

### Flow Field Distortion
```glsl
vec2 flowField(vec2 uv, float time, float strength) {
    float angle = snoise(uv * 4.0 + time * 0.1) * 6.28318;
    vec2 flow = vec2(cos(angle), sin(angle)) * strength;
    return uv + flow;
}
```

## Color Manipulation

### HSV <-> RGB Conversion
```glsl
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
```

### Color Grading Curves
```glsl
float contrast(float val, float amount) {
    return (val - 0.5) * amount + 0.5;
}

vec3 contrast(vec3 color, float amount) {
    return vec3(contrast(color.r, amount), 
                contrast(color.g, amount), 
                contrast(color.b, amount));
}

vec3 levels(vec3 color, float inBlack, float inWhite, float gamma, float outBlack, float outWhite) {
    vec3 result = (color - inBlack) / (inWhite - inBlack);
    result = pow(result, vec3(1.0 / gamma));
    result = result * (outWhite - outBlack) + outBlack;
    return clamp(result, 0.0, 1.0);
}
```

### Tone Mapping
```glsl
// Reinhard
vec3 reinhardTonemap(vec3 color) {
    return color / (color + vec3(1.0));
}

// ACES Filmic
vec3 acesTonemap(vec3 color) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

// Uncharted 2
vec3 uncharted2Tonemap(vec3 x) {
    float A = 0.15;
    float B = 0.50;
    float C = 0.10;
    float D = 0.20;
    float E = 0.02;
    float F = 0.30;
    return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
}
```

## UV Manipulation

### Rotate UV
```glsl
vec2 rotateUV(vec2 uv, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    mat2 rotMatrix = mat2(c, -s, s, c);
    return rotMatrix * (uv - 0.5) + 0.5;
}
```

### Kaleidoscope Effect
```glsl
vec2 kaleidoscope(vec2 uv, float segments) {
    vec2 centered = uv - 0.5;
    float angle = atan(centered.y, centered.x);
    float radius = length(centered);
    float segmentAngle = 6.28318 / segments;
    angle = mod(angle, segmentAngle);
    if (mod(floor(atan(centered.y, centered.x) / segmentAngle), 2.0) == 1.0) {
        angle = segmentAngle - angle;
    }
    return vec2(cos(angle), sin(angle)) * radius + 0.5;
}
```

### Polar Coordinates
```glsl
vec2 cartesianToPolar(vec2 uv) {
    vec2 centered = uv - 0.5;
    float angle = atan(centered.y, centered.x) / 6.28318 + 0.5;
    float radius = length(centered) * 2.0;
    return vec2(angle, radius);
}

vec2 polarToCartesian(vec2 polar) {
    float angle = (polar.x - 0.5) * 6.28318;
    float radius = polar.y * 0.5;
    return vec2(cos(angle), sin(angle)) * radius + 0.5;
}
```

### Tiling and Mirroring
```glsl
vec2 tile(vec2 uv, vec2 count) {
    return fract(uv * count);
}

vec2 mirrorTile(vec2 uv, vec2 count) {
    vec2 tiled = uv * count;
    vec2 mirrored = abs(fract(tiled * 0.5) * 2.0 - 1.0);
    return mirrored;
}
```

## SDF (Signed Distance Fields)

### Basic Shapes
```glsl
float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
    r.xy = (p.x > 0.0) ? r.xy : r.zw;
    r.x = (p.y > 0.0) ? r.x : r.y;
    vec2 q = abs(p) - b + r.x;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
```

### SDF Operations
```glsl
// Union
float opUnion(float d1, float d2) {
    return min(d1, d2);
}

// Subtraction
float opSubtraction(float d1, float d2) {
    return max(-d1, d2);
}

// Intersection
float opIntersection(float d1, float d2) {
    return max(d1, d2);
}

// Smooth Union
float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}
```

## Blend Modes

```glsl
vec3 blendScreen(vec3 base, vec3 blend) {
    return 1.0 - (1.0 - base) * (1.0 - blend);
}

vec3 blendMultiply(vec3 base, vec3 blend) {
    return base * blend;
}

vec3 blendOverlay(vec3 base, vec3 blend) {
    return mix(
        2.0 * base * blend,
        1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
        step(0.5, base)
    );
}

vec3 blendSoftLight(vec3 base, vec3 blend) {
    return mix(
        2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
        sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
        step(0.5, blend)
    );
}

vec3 blendAdd(vec3 base, vec3 blend) {
    return min(base + blend, vec3(1.0));
}
```

## Sampling Patterns

### Box Blur
```glsl
vec4 boxBlur(sampler2D tex, vec2 uv, vec2 texelSize, int radius) {
    vec4 result = vec4(0.0);
    float count = 0.0;
    for(int x = -radius; x <= radius; x++) {
        for(int y = -radius; y <= radius; y++) {
            result += texture(tex, uv + vec2(x, y) * texelSize);
            count += 1.0;
        }
    }
    return result / count;
}
```

### Gaussian Blur (Separable)
```glsl
// Horizontal pass
vec4 gaussianBlurH(sampler2D tex, vec2 uv, vec2 texelSize) {
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    vec4 result = texture(tex, uv) * weights[0];
    for(int i = 1; i < 5; i++) {
        result += texture(tex, uv + vec2(texelSize.x * float(i), 0.0)) * weights[i];
        result += texture(tex, uv - vec2(texelSize.x * float(i), 0.0)) * weights[i];
    }
    return result;
}

// Vertical pass
vec4 gaussianBlurV(sampler2D tex, vec2 uv, vec2 texelSize) {
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    vec4 result = texture(tex, uv) * weights[0];
    for(int i = 1; i < 5; i++) {
        result += texture(tex, uv + vec2(0.0, texelSize.y * float(i))) * weights[i];
        result += texture(tex, uv - vec2(0.0, texelSize.y * float(i))) * weights[i];
    }
    return result;
}
```

## Anti-Aliasing Helpers

```glsl
// Smooth step with adjustable edge width
float smoothEdge(float edge, float width, float value) {
    return smoothstep(edge - width, edge + width, value);
}

// Analytical anti-aliasing for SDFs
float aaStep(float dist, float width) {
    return smoothstep(-width, width, dist);
}

// Screen-space derivative based AA
float fwidth(float value) {
    return abs(dFdx(value)) + abs(dFdy(value));
}
```
