# Troubleshooting GLSL MAT Vertex Shaders

Diagnosis and fixes for the most common vertex shader errors in TouchDesigner's GLSL MAT.

## Error Table

| Symptom | Cause | Fix |
|---------|-------|-----|
| `'P' : redefinition` | Declared `P`, `N`, or other TD attribute in shader | Remove the declaration — TD auto-injects these |
| Black / no geometry | Forgot `TDDeform()` | Always `TDDeform(P)` before `TDWorldToProj()` |
| Geometry visible but not moving with instances | Manual matrix multiply instead of `TDDeform` | Route all positions through `TDDeform()` |
| Varyings mismatch / undeclared identifier | `out` name/type in vertex differs from `in` in pixel | Check spelling and type match exactly |
| `vUV` undefined in pixel shader | Custom vertex shader replaces TD defaults | Declare `out vec2 vTexCoord` in vertex, write `vTexCoord = uv[0].st`, use `in vec2 vTexCoord` in pixel |
| Normals wrong on rotated instances | Used `worldForNormals * N` without instance transform | Use `TDDeformNorm(N)` when instancing is active |
| Normal flipping / inverted lighting | Wrong matrix for normal transform | Use `worldForNormals`, not `mat3(world)` — handles non-uniform scale |
| `layout` error in pixel shader | Missing layout qualifier on output | Use `layout(location = 0) out vec4 fragColor;` |
| Instancing shows one copy | `TDInstanceID()` returns 0 for all | Verify Render TOP instancing is enabled and instance count > 1 |
| Shader compiles but geometry is invisible | `gl_Position` not written | Every vertex shader must write `gl_Position` |

## The Custom-VS-Replaces-Defaults Trap

When you supply a custom vertex shader, TD's default varyings (`vUV`, `vP`, `vN`, `vColor`) stop existing. If your pixel shader references any of them, you get an undeclared identifier error.

**The fix**: declare and write every varying your pixel shader needs.

```glsl
// Vertex — reproduce only the defaults you actually need
out vec2 vTexCoord;
out vec3 vWorldNorm;

void main() {
    vec4 worldPos = TDDeform(P);
    vTexCoord  = uv[0].st;
    vWorldNorm = normalize(uTDMats[TDCameraIndex()].worldForNormals * N);
    gl_Position = TDWorldToProj(worldPos);
}
```

## Debugging Normals

Normals are invisible — visualize them to verify correctness:

```glsl
// Pixel shader — normal visualization
in vec3 vWorldNorm;
layout(location = 0) out vec4 fragColor;

void main() {
    // Map normal xyz from [-1,1] to [0,1] for visualization
    vec3 col = normalize(vWorldNorm) * 0.5 + 0.5;
    fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
```

- **All blue** (0, 0, 1): normals point +Z — likely object-space normals not transformed to world space
- **Uniform color across rotated instances**: normals not going through `TDDeformNorm()` — they ignore instance rotation
- **Black patches**: normals are zero-length — check that `N` is valid on the input SOP (use a Normal SOP upstream)

## Debugging Instancing

When instances don't behave as expected:

1. **Verify Render TOP**: Instance count, instance CHOP/DAT connected
2. **Check `TDInstanceID()`**: Pass it as a varying and visualize in pixel shader
3. **Verify `TDDeform()`**: Without it, all instances render at origin

```glsl
// Vertex — debug instance ID
flat out float vID;

void main() {
    vID = float(TDInstanceID());
    gl_Position = TDWorldToProj(TDDeform(P));
}

// Pixel — visualize instance ID as color
flat in float vID;
layout(location = 0) out vec4 fragColor;

void main() {
    float t = mod(vID, 10.0) / 10.0;
    fragColor = TDOutputSwizzle(vec4(t, 1.0 - t, 0.5, 1.0));
}
```
