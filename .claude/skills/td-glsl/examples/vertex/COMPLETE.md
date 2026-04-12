# Complete Vertex + Pixel Shader Pairs

Each example is a working pair — copy both DATs into TouchDesigner and wire them to a GLSL MAT.

## Textured Unlit Material

The simplest useful shader: pass UVs and sample a texture.

```glsl
// === VERTEX SHADER ===
out vec2 vTexCoord;

void main() {
    vTexCoord   = uv[0].st;
    gl_Position = TDWorldToProj(TDDeform(P));
}
```

```glsl
// === PIXEL SHADER ===
in vec2 vTexCoord;
layout(location = 0) out vec4 fragColor;

void main() {
    vec4 tex  = texture(sTD2DInputs[0], vTexCoord);
    fragColor = TDOutputSwizzle(tex);
}
```

**TD Setup**: Wire a texture TOP into the GLSL MAT's first input slot.

---

## Noise Displacement with Color Ramp

Displaces vertices along normals using simplex noise, maps displacement to a cool-to-warm color gradient.

```glsl
// === VERTEX SHADER ===
uniform float uAmount;
uniform float uFrequency;
uniform float uTime;

out vec3 vWorldPos;
out vec3 vWorldNorm;
out float vDisplace;

void main() {
    float n   = TDSimplexNoise(vec3(P * uFrequency + uTime * 0.3));
    vec3 disp = P + N * n * uAmount;
    vDisplace = n;

    vec4 worldPos = TDDeform(disp);
    vWorldPos  = worldPos.xyz;
    vWorldNorm = normalize(uTDMats[TDCameraIndex()].worldForNormals * N);
    gl_Position = TDWorldToProj(worldPos);
}
```

```glsl
// === PIXEL SHADER ===
in vec3 vWorldPos;
in vec3 vWorldNorm;
in float vDisplace;

layout(location = 0) out vec4 fragColor;

void main() {
    float t   = vDisplace * 0.5 + 0.5;
    vec3 cool = vec3(0.1, 0.2, 0.8);
    vec3 warm = vec3(0.9, 0.4, 0.1);
    vec3 col  = mix(cool, warm, t);

    // Simple directional light
    float diff = max(dot(normalize(vWorldNorm), vec3(0, 1, 0)), 0.1);
    fragColor  = TDOutputSwizzle(vec4(col * diff, 1.0));
}
```

**TD Setup**: Vectors page — `uAmount` float `0.2`, `uFrequency` float `3.0`, `uTime` float = `absTime.seconds`

---

## Instanced Material with Per-Instance Color

Each instance gets a unique color from a CHOP texture. Uses `flat` interpolation so the color is uniform across each instance's faces.

```glsl
// === VERTEX SHADER ===
uniform sampler2D uColorTex;
uniform int uInstanceCount;

out vec3 vWorldPos;
out vec3 vWorldNorm;
flat out vec4 vInstanceColor;

void main() {
    int id  = TDInstanceID();
    float t = (float(id) + 0.5) / float(uInstanceCount);
    vInstanceColor = texture(uColorTex, vec2(t, 0.5));

    vec4 worldPos = TDDeform(P);
    vWorldPos  = worldPos.xyz;
    vWorldNorm = normalize(TDDeformNorm(N));
    gl_Position = TDWorldToProj(worldPos);
}
```

```glsl
// === PIXEL SHADER ===
in vec3 vWorldPos;
in vec3 vWorldNorm;
flat in vec4 vInstanceColor;

layout(location = 0) out vec4 fragColor;

void main() {
    float diff = max(dot(normalize(vWorldNorm), normalize(vec3(1, 1, 0.5))), 0.1);
    fragColor  = TDOutputSwizzle(vec4(vInstanceColor.rgb * diff, 1.0));
}
```

**TD Setup**: Render TOP → enable instancing, set instance count. Wire a CHOP-to-TOP (with instance colors) into `uColorTex`. Vectors page — `uInstanceCount` int = Render TOP instance count.

---

## Normal-Mapped Phong Lit Material

Full TBN matrix construction in vertex shader, normal map sampling + multi-light Phong in pixel shader.

```glsl
// === VERTEX SHADER ===
out vec3 vWorldPos;
out vec2 vTexCoord;
out mat3 vTBN;

void main() {
    vec4 worldPos = TDDeform(P);

    mat3 normMat  = uTDMats[TDCameraIndex()].worldForNormals;
    vec3 wNormal  = normalize(normMat * N);
    vec3 wTangent = normalize(mat3(uTDMats[TDCameraIndex()].world) * T.xyz);
    wTangent      = normalize(wTangent - dot(wTangent, wNormal) * wNormal);
    vec3 wBitang  = cross(wNormal, wTangent) * T.w;

    vWorldPos = worldPos.xyz;
    vTexCoord = uv[0].st;
    vTBN      = mat3(wTangent, wBitang, wNormal);
    gl_Position = TDWorldToProj(worldPos);
}
```

```glsl
// === PIXEL SHADER ===
in vec3 vWorldPos;
in vec2 vTexCoord;
in mat3 vTBN;

layout(location = 0) out vec4 fragColor;

uniform vec4  uDiffuseColor;
uniform float uShininess;
uniform vec3  uSpecularColor;

void main() {
    TDCheckDiscard();

    // Sample and transform normal map
    vec3 tsNorm   = texture(sTD2DInputs[1], vTexCoord).xyz * 2.0 - 1.0;
    vec3 worldNorm = normalize(vTBN * tsNorm);

    // Sample diffuse texture
    vec3 albedo = uDiffuseColor.rgb * texture(sTD2DInputs[0], vTexCoord).rgb;

    // Accumulate scene lights
    vec4 litColor = vec4(0.0);
    for (int i = 0; i < TD_NUM_LIGHTS; i++) {
        litColor += TDLighting(i, vWorldPos, worldNorm, albedo, uShininess, uSpecularColor);
    }
    litColor.rgb += albedo * 0.1;  // Ambient
    litColor = TDFog(litColor, vWorldPos, TDCameraIndex());

    fragColor = TDOutputSwizzle(litColor);
}
```

**TD Setup**: Input 0 = diffuse texture, Input 1 = normal map. Colors 1 → `uDiffuseColor` vec4 `1,1,1,1`. Vectors 1 → `uShininess` float `32`. Colors 2 → `uSpecularColor` vec3 `1,1,1`. Add a Light COMP to the scene.
