# GLSL in TouchDesigner — Orientation

This is a routing page. For detailed GLSL shader writing, use the specialized skills below.

## Which Skill to Use

| Task | Skill | Operator |
|------|-------|----------|
| Pixel/fragment shaders, 2D image effects, generative textures, feedback loops | **td-glsl** → @domains/pixel.md | GLSL TOP |
| Vertex shaders, 3D materials, displacement, instancing | **td-glsl** → @domains/vertex.md | GLSL MAT |
| Compute shaders, particles, point clouds, SSBOs | **td-glsl** → @domains/compute.md | GLSL POP / GLSL Advanced POP / GLSL Copy POP |

---

## Quick Reference: GLSL Operator Types

### GLSL TOP (Pixel Shader)

Created automatically: `glsl1` + `glsl1_pixel` (textDAT) + `glsl1_compute` (textDAT) + `glsl1_info`

```glsl
out vec4 fragColor;
void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    fragColor = TDOutputSwizzle(color);
}
```

### GLSL MAT (Vertex + Pixel Shader)

Created automatically: `glslmat1` + `glslmat1_vertex` (textDAT) + `glslmat1_pixel` (textDAT) + `glslmat1_info`

Standard transform chain: `gl_Position = TDWorldToProj(TDDeform(P));`

### GLSL POP (Compute Shader)

Created automatically: `glsl1` + `glsl1_compute` (textDAT) + `glsl1_info`

```glsl
void main() {
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P();
    P[id] = pos;
}
```

---

## Shared: Uniforms Setup

All GLSL operators share the same uniform binding pattern:

```
TouchDesigner UI          GLSL
─────────────────────────────────
vec0name = 'uTime'    →  uniform float uTime;
vec0valuex = 1.0      →  uTime value
```

```python
glsl_op = op('glsl1')
glsl_op.par.vec0name = 'uTime'
glsl_op.par.vec0valuex.mode = ParMode.EXPRESSION
glsl_op.par.vec0valuex.expr = 'absTime.seconds'
```

---

## Shared: Built-in Utility Functions

Available in all TD GLSL contexts (no includes needed):

```glsl
// Noise
float TDPerlinNoise(vec2/vec3/vec4 v);
float TDSimplexNoise(vec2/vec3/vec4 v);

// Color conversion
vec3 TDHSVToRGB(vec3 c);
vec3 TDRGBToHSV(vec3 c);

// Matrix transforms
mat3 TDRotateX/Y/Z(float radians);
mat3 TDRotateOnAxis(float radians, vec3 axis);
mat3 TDCreateRotMatrix(vec3 from, vec3 to);
```

---

## Shader Update & Error Checking

```python
# Update shader code
op('glsl1_pixel').text = shader_code
op('glsl1').cook(force=True)

# Check compilation errors
print(op('glsl1_info').text)
```
