# Quick-Reference Vertex Patterns

Vertex-only snippets for common effects. Pair each with an appropriate pixel shader from @COMPLETE.md or @references/LIGHTING.md.

## The Displacement Pattern

Offset vertices along their normal using noise or a uniform.

```glsl
uniform float uAmount;
uniform float uTime;

void main() {
    float n = TDSimplexNoise(vec3(P * 2.0 + uTime * 0.5));
    vec3 displaced = P + N * n * uAmount;
    gl_Position = TDWorldToProj(TDDeform(displaced));
}
```

## The Wave Pattern

Sinusoidal deformation along one or more axes.

```glsl
uniform float uFrequency;
uniform float uAmplitude;
uniform float uTime;

void main() {
    vec3 pos = P;
    pos.y += sin(pos.x * uFrequency + uTime) * uAmplitude;
    pos.y += sin(pos.z * uFrequency * 0.7 + uTime * 1.3) * uAmplitude * 0.5;
    gl_Position = TDWorldToProj(TDDeform(pos));
}
```

## The Instance-Data Pattern

Sample per-instance data from a texture using `TDInstanceID()`.

```glsl
uniform sampler2D uInstanceData;
uniform int uInstanceCount;

void main() {
    int id = TDInstanceID();
    float u = (float(id) + 0.5) / float(uInstanceCount);
    vec4 offset = texture(uInstanceData, vec2(u, 0.5));

    vec4 worldPos = TDDeform(P + offset.xyz);
    gl_Position = TDWorldToProj(worldPos);
}
```

## The Simple-Instance Pattern

Use TD's built-in instance helpers instead of manual texture sampling.

```glsl
flat out vec4 vColor;

void main() {
    vColor = TDInstanceColor(Cd);
    vec4 worldPos = TDDeform(P);
    gl_Position = TDWorldToProj(worldPos);
}
```

## The Pass-Everything Pattern

Forward all standard data to the pixel shader for maximum flexibility.

```glsl
out vec3 vWorldPos;
out vec3 vWorldNorm;
out vec2 vTexCoord;
out vec4 vColor;

void main() {
    vec4 worldPos = TDDeform(P);
    vWorldPos  = worldPos.xyz;
    vWorldNorm = normalize(uTDMats[TDCameraIndex()].worldForNormals * N);
    vTexCoord  = uv[0].st;
    vColor     = Cd;
    gl_Position = TDWorldToProj(worldPos);
}
```

## The Explode Pattern

Push faces outward along their normal over time (requires flat normals on SOP).

```glsl
uniform float uExplode;  // 0 = assembled, 1+ = exploded

out vec3 vWorldNorm;

void main() {
    vec3 pos = P + N * uExplode;
    vec4 worldPos = TDDeform(pos);
    vWorldNorm = normalize(uTDMats[TDCameraIndex()].worldForNormals * N);
    gl_Position = TDWorldToProj(worldPos);
}
```

## The Point-Size Pattern

For point-cloud rendering, control point size per vertex.

```glsl
uniform float uBaseSize;

void main() {
    gl_Position  = TDWorldToProj(TDDeform(P));
    gl_PointSize = uBaseSize;
}
```
