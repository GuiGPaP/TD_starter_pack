# Common GLSL Patterns

Ready-to-use shader snippets. Each is a complete, working shader.

## Basic Texture Sampling

The minimal GLSL TOP shader — sample input and output.

```glsl
out vec4 fragColor;

void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    fragColor = TDOutputSwizzle(color);
}
```

## Time-Based Animation

```glsl
uniform float uTime;

out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;
    uv.x += sin(uTime) * 0.1;
    uv.y += cos(uTime) * 0.1;

    vec4 color = texture(sTD2DInputs[0], uv);
    fragColor = TDOutputSwizzle(color);
}
```

**TD Setup**: Vectors -> `uTime` (float) = `absTime.seconds`

## Multi-Input Blending

```glsl
uniform float uBlend;

out vec4 fragColor;

void main() {
    vec4 input1 = texture(sTD2DInputs[0], vUV.st);
    vec4 input2 = texture(sTD2DInputs[1], vUV.st);
    vec4 color = mix(input1, input2, uBlend);
    fragColor = TDOutputSwizzle(color);
}
```

**TD Setup**: Vectors -> `uBlend` (float) = `0.5`

## Generative Circle

```glsl
uniform float uAspect;

out vec4 fragColor;

void main() {
    vec2 uv = vUV.st * 2.0 - 1.0;
    uv.x *= uAspect;

    float dist = length(uv);
    float circle = smoothstep(0.5, 0.45, dist);

    fragColor = TDOutputSwizzle(vec4(vec3(circle), 1.0));
}
```

**TD Setup**: Vectors -> `uAspect` (float) = `me.width / me.height`

## Feedback Loop

Input 0: current frame. Input 1: Feedback TOP (output of this GLSL TOP).

```glsl
uniform float uDecay;

out vec4 fragColor;

void main() {
    vec4 current = texture(sTD2DInputs[0], vUV.st);
    vec4 previous = texture(sTD2DInputs[1], vUV.st);
    vec4 color = mix(previous * uDecay, current, 0.1);
    fragColor = TDOutputSwizzle(color);
}
```

**TD Setup**: Vectors -> `uDecay` (float) = `0.98`

## Displacement with Noise

```glsl
uniform float uDistortionAmount;
uniform float uTime;

out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;

    vec2 offset = vec2(
        TDSimplexNoise(vec3(uv * 5.0, uTime * 0.5)),
        TDSimplexNoise(vec3(uv * 5.0 + 100.0, uTime * 0.5))
    );

    uv += offset * uDistortionAmount;
    vec4 color = texture(sTD2DInputs[0], uv);
    fragColor = TDOutputSwizzle(color);
}
```

**TD Setup**:
- Vectors 1 -> `uDistortionAmount` (float) = `0.02`
- Vectors 2 -> `uTime` (float) = `absTime.seconds`

## Procedural Noise (FBM)

Multiple octaves of simplex noise for organic patterns.

```glsl
uniform float uTime;
uniform float uScale;

out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;

    float noise = 0.0;
    noise += TDSimplexNoise(vec3(uv * uScale, uTime * 0.5)) * 0.5;
    noise += TDSimplexNoise(vec3(uv * uScale * 2.0, uTime * 0.3)) * 0.25;
    noise += TDSimplexNoise(vec3(uv * uScale * 4.0, uTime * 0.2)) * 0.125;

    fragColor = TDOutputSwizzle(vec4(vec3(noise), 1.0));
}
```

**TD Setup**:
- Vectors 1 -> `uTime` (float) = `absTime.seconds`
- Vectors 2 -> `uScale` (float) = `5.0`

## Color Grading (HSV)

```glsl
uniform float uHueShift;
uniform float uSaturation;
uniform float uBrightness;
uniform float uContrast;

out vec4 fragColor;

void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);

    vec3 hsv = TDRGBToHSV(color.rgb);
    hsv.x += uHueShift;
    hsv.y *= uSaturation;
    hsv.z += uBrightness;
    color.rgb = TDHSVToRGB(hsv);

    color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
    fragColor = TDOutputSwizzle(color);
}
```

**TD Setup**:
- Vectors 1 -> `uHueShift` (float) = `0.0`
- Vectors 2 -> `uSaturation` (float) = `1.0`
- Vectors 3 -> `uBrightness` (float) = `0.0`
- Vectors 4 -> `uContrast` (float) = `1.0`

## Box Blur

For better quality, use two passes (horizontal + vertical) or a Gaussian kernel.

```glsl
uniform float uBlurSize;

out vec4 fragColor;

void main() {
    vec2 texelSize = 1.0 / vec2(textureSize(sTD2DInputs[0], 0));
    vec4 color = vec4(0.0);

    for(float x = -1.0; x <= 1.0; x += 1.0) {
        for(float y = -1.0; y <= 1.0; y += 1.0) {
            vec2 offset = vec2(x, y) * texelSize * uBlurSize;
            color += texture(sTD2DInputs[0], vUV.st + offset);
        }
    }

    color /= 9.0;
    fragColor = TDOutputSwizzle(color);
}
```

**TD Setup**: Vectors -> `uBlurSize` (float) = `1.0`

## Chromatic Aberration

The Length-Guard Pattern: check vector length before normalizing to prevent division-by-zero when UV equals the center point.

```glsl
uniform float uAberrationAmount;
uniform vec2 uCenter;

out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;
    vec2 toCenter = uCenter - uv;
    float dist = length(toCenter);

    // Guard: when uv == uCenter, dist is 0 and normalize() would produce NaN
    vec2 direction = dist > 0.0 ? toCenter / dist : vec2(0.0);
    float offset = uAberrationAmount * dist * 0.01;

    float r = texture(sTD2DInputs[0], uv + direction * offset).r;
    float g = texture(sTD2DInputs[0], uv).g;
    float b = texture(sTD2DInputs[0], uv - direction * offset).b;
    float a = texture(sTD2DInputs[0], uv).a;

    fragColor = TDOutputSwizzle(vec4(r, g, b, a));
}
```

**TD Setup**:
- Vectors 1 -> `uAberrationAmount` (float) = `0.5`
- Vectors 2 -> `uCenter` (vec2) = `0.5, 0.5`

## Blend Modes

Screen, multiply, and overlay — the three most common compositing modes.

```glsl
uniform int uMode;  // 0=screen, 1=multiply, 2=overlay

out vec4 fragColor;

void main() {
    vec3 base = texture(sTD2DInputs[0], vUV.st).rgb;
    vec3 blend = texture(sTD2DInputs[1], vUV.st).rgb;

    vec3 result;
    if(uMode == 0) {
        result = 1.0 - (1.0 - base) * (1.0 - blend);  // Screen
    } else if(uMode == 1) {
        result = base * blend;  // Multiply
    } else {
        // Overlay: multiply darks, screen lights
        vec3 low = 2.0 * base * blend;
        vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
        result = mix(low, high, step(0.5, base));
    }

    fragColor = TDOutputSwizzle(vec4(result, 1.0));
}
```

**TD Setup**: Vectors -> `uMode` (int) = `0`
