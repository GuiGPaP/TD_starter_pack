# GPU Instanced Text Rendering

## Pipeline

```
quad_sop (1x1 rect) → null_quad → render_geo (Geometry COMP)
                                       ↓ instancing from glyph_data CHOP
                                       ↓ material: text_glsl (GLSL MAT)
                                  text_camera (ortho) → render_text (Render TOP)
```

## Geometry COMP Instancing Setup

```python
geo.par.instancing = True
geo.par.instanceop = 'glyph_data'
geo.par.instancetx = 'tx'      # char center X (pixels)
geo.par.instancety = 'ty'      # char center Y (flipped)
geo.par.instancetz = 'tz'      # 0
geo.par.instancesx = 'sx'      # char width (pixels)
geo.par.instancesy = 'sy'      # char height (pixels)
geo.par.instancesz = 'sz'      # 1
```

Atlas UV data is passed via a secondary texture (CHOP→TOP), sampled in vertex shader with `TDInstanceID()`.

## CHOP to TOP for Instance Data

```python
chopToTop.par.chop = 'glyph_data'
chopToTop.par.dataformat = 'rgba32float'
# Output: Nx10 texture (N instances, 10 channels)
# Row layout: tx(0), ty(1), tz(2), sx(3), sy(4), sz(5),
#             atlas_u(6), atlas_v(7), atlas_w(8), atlas_h(9)
```

## GLSL MAT Configuration

```python
mat.par.vdat = 'text_vert'
mat.par.pdat = 'text_frag'
mat.par.sampler = 2
mat.par.sampler0name = 'sAtlas'
mat.par.sampler0top = 'atlas_top'
mat.par.sampler0filter = 'linear'
mat.par.sampler1name = 'sInstanceData'
mat.par.sampler1top = 'instance_data_top'
mat.par.sampler1filter = 'nearest'   # MUST be nearest for texelFetch
```

## Vertex Shader

```glsl
uniform sampler2D sInstanceData;
uniform int uNumInstances;

out vec2 vLocalUV;
flat out vec4 vAtlasRect;

void main()
{
    vec4 worldPos = TDDeform(P);
    vLocalUV = uv[0].st;

    // Read atlas UV rect from instance data texture
    int id = TDInstanceID();
    float au = texelFetch(sInstanceData, ivec2(id, 6), 0).r;
    float av = texelFetch(sInstanceData, ivec2(id, 7), 0).r;
    float aw = texelFetch(sInstanceData, ivec2(id, 8), 0).r;
    float ah = texelFetch(sInstanceData, ivec2(id, 9), 0).r;
    vAtlasRect = vec4(au, av, aw, ah);

    gl_Position = TDWorldToProj(worldPos);
}
```

**Key**: `texelFetch` with integer coordinates — requires `nearest` filter on sampler.

## Fragment Shader

```glsl
uniform sampler2D sAtlas;
uniform vec4 uTextColor;

in vec2 vLocalUV;
flat in vec4 vAtlasRect;

layout(location = 0) out vec4 fragColor;

void main()
{
    vec2 atlasUV = vAtlasRect.xy + vLocalUV * vAtlasRect.zw;
    vec4 texel = texture(sAtlas, atlasUV);
    float alpha = texel.a * uTextColor.a;
    if (alpha < 0.01) discard;
    fragColor = TDOutputSwizzle(vec4(uTextColor.rgb, alpha));
}
```

## Orthographic Camera

```python
cam.par.projection = 'ortho'    # NOT 'orthographic'!
cam.par.orthowidth = 1920       # = render width in pixels
cam.par.tx = 960                # half-width
cam.par.ty = -540               # half-height (negative = Y flip)
cam.par.tz = 10                 # look toward -Z
```

**Gotcha**: TD camera uses `'ortho'` not `'orthographic'` — silent failure, renders perspective instead.

## uNumInstances Uniform

Track dynamically via expression:
```python
mat.par.vec1name = 'uNumInstances'
mat.par.vec1valuex.expr = "op('glyph_data').numSamples"
```
