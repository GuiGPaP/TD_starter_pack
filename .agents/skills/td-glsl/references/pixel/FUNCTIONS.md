# TouchDesigner GLSL Functions Reference

Complete API reference for TouchDesigner-specific GLSL functions and automatic variables.

## Table of Contents

- [Automatic Variables](#automatic-variables)
- [TD Functions](#td-functions)
- [Standard GLSL Texture Functions](#standard-glsl-texture-functions)
- [Useful Helper Patterns](#useful-helper-patterns)

---

## Automatic Variables

These are injected by TouchDesigner. **Never declare them.**

### Texture Inputs

```glsl
sTD2DInputs[N]  // sampler2D array — input textures by index
```

Get dimensions: `ivec2 size = textureSize(sTD2DInputs[0], 0);`

### Varyings

```glsl
vUV      // vec2 — UV coordinates (0-1)
vP       // vec3 — world position
vN       // vec3 — normal vector
vColor   // vec4 — vertex color
```

### Depth Info

```glsl
uniform int uTDCurrentDepth;  // current slice (3D textures / 2D arrays)
```

---

## TD Functions

### Output (required)

```glsl
vec4 TDOutputSwizzle(vec4 color)
```

Handles color space conversion and channel swizzling. Always wrap final output.

### Noise

```glsl
float TDSimplexNoise(vec2 p)   // fast, smooth, recommended
float TDSimplexNoise(vec3 p)
float TDPerlinNoise(vec2 p)    // classic Perlin
float TDPerlinNoise(vec3 p)
```

Quality mode configurable in GLSL TOP parameters (Performance vs Quality).

```glsl
float noise = TDSimplexNoise(vec3(vUV.st * 5.0, uTime));
```

### Color Conversion

```glsl
vec3 TDHSVToRGB(vec3 hsv)  // H: 0-1 wrapping, S: 0-1, V: 0-1
vec3 TDRGBToHSV(vec3 rgb)
```

```glsl
vec3 hsv = TDRGBToHSV(color.rgb);
hsv.x += 0.5;  // shift hue 180 degrees
color.rgb = TDHSVToRGB(hsv);
```

### Coordinate Utilities

```glsl
vec2 TDUVMap(vec2 uv)       // apply operator's UV mapping
vec2 TDDefaultCoord()       // default coordinates for current pixel
```

---

## Standard GLSL Texture Functions

```glsl
vec4 texture(sampler2D tex, vec2 uv)               // filtered sample
vec4 texelFetch(sampler2D tex, ivec2 coord, int lod) // exact texel, no filtering
ivec2 textureSize(sampler2D tex, int lod)           // dimensions in pixels
```

---

## Useful Helper Patterns

### Remap Range

```glsl
float remap(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}
```

### Aspect-Corrected Coordinates

```glsl
uniform float uAspect;

vec2 uv = vUV.st * 2.0 - 1.0;  // center to -1..1
uv.x *= uAspect;               // correct for non-square output
```

### Polar Coordinates

```glsl
vec2 toPolar(vec2 uv) {
    return vec2(atan(uv.y, uv.x), length(uv));
}
```

### Luminance

```glsl
float luminance(vec3 rgb) {
    return dot(rgb, vec3(0.299, 0.587, 0.114));
}
```
