<!-- session_id: dbf6f0c2-ce4e-484c-b125-e4817fabc856 -->
# Éliminer poptoSOP via GLSL Copy POP — 100% GPU

## Context

Avec fontsize=10 et 18,800 chars, le `poptoSOP` prend **1039ms CPU par cook** → 10 FPS. Le poptoSOP ramène toutes les données POP (GPU) vers le CPU, annulant le bénéfice des POPs. On doit garder TOUT sur GPU.

## Architecture cible

```
spec_dat (tableDAT)
    ↓
dattoPOP (GPU, attributes: P, W, pscale, Color, charwidth, glyph_w, glyph_h)
    ↓ (input 1 = template positions)
┌─ render_geo (Geometry COMP) ──────────────────────────────┐
│                                                            │
│  rectanglePOP (1×1 quad, 4 points, Tex UV 0→1)            │
│       ↓ input 0 (template geometry)                        │
│                                                            │
│  GLSL Copy POP (18K copies du quad)                        │
│    Point shader:                                           │
│      - Lit P, charwidth, pscale, Color, W, glyph_w/h      │
│        depuis input 1 via TDIn_*(1, TDCopyIndex())         │
│      - Scale quad par charwidth × pscale                   │
│      - Translate par position instance                     │
│      - Écrit Color, abuse N pour (glyph_w, glyph_h, W)    │
│       ↓                                                    │
│  nullPOP ← render flag ON                                  │
└────────────────────────────────────────────────────────────┘
    ↓
GLSL MAT (sample atlas_3d via N.z=W, UV crop via N.x/y=glyph_w/h)
    ↓
text_camera (ortho) → render_text
```

**Pourquoi c'est rapide :**
- GLSL Copy POP = compute shader GPU (~0.1ms pour 18K copies)
- 18K chars × 2 triangles = 36K triangles (vs 800K textPOP, vs 1039ms poptoSOP)
- Render flag direct, zero CPU data transfer
- dattoPOP reste GPU-natif

## GLSL Copy POP — Point shader

```glsl
void main() {
    const uint id = TDIndex();
    if (id >= TDNumPoints()) return;
    
    // Template quad vertex (input 0)
    vec3 quadP = TDIn_P();           // 0→1 quad position
    vec3 quadTex = TDIn_Tex();       // UV coordinates
    
    // Instance data (input 1, per-copy)
    uint ci = TDCopyIndex();
    vec3 instP = TDIn_P(1, ci);           // tx, ty, tz
    float cw = TDIn_charwidth(1, ci);     // char width
    float ps = TDIn_pscale(1, ci);        // font size (scale)
    vec4 instColor = TDIn_Color(1, ci);   // font color RGBA
    float w = TDIn_W(1, ci);             // atlas slice index
    float gw = TDIn_glyph_w(1, ci);     // glyph width norm
    float gh = TDIn_glyph_h(1, ci);     // glyph height norm
    
    // Scale quad and translate
    vec3 pos = quadP;
    pos.x *= cw;     // scale by char width
    pos.y *= ps;     // scale by font size
    pos += instP;    // translate to char position
    
    P[id] = pos;
    Color[id] = instColor;
    Tex[id] = quadTex;
    // Abuse N to pass atlas metadata to fragment shader
    N[id] = vec3(gw, gh, w);
    
    TDUpdatePointGroups();
}
```

**Output Attributes :** `P Color Tex N`

## GLSL MAT — Fragment shader

```glsl
uniform sampler2DArray sAtlas;
in vec2 vTexCoord;   // from Tex.xy (quad UVs 0→1)
in vec3 vNormal;     // N = (glyph_w, glyph_h, W)
in vec4 vColor;      // from Color

layout(location = 0) out vec4 fragColor;

void main() {
    float glyphW = vNormal.x;
    float glyphH = vNormal.y;
    float sliceW = vNormal.z;
    
    vec2 atlasUV = vec2(0.5) + (vTexCoord - vec2(0.5)) * vec2(glyphW, glyphH);
    vec4 texel = texture(sAtlas, vec3(atlasUV, sliceW));
    
    if (texel.a < 0.01) discard;
    fragColor = TDOutputSwizzle(vec4(vColor.rgb, texel.a * vColor.a));
}
```

## GLSL MAT — Vertex shader

```glsl
out vec2 vTexCoord;
out vec3 vNormal;
out vec4 vColor;

void main() {
    gl_Position = TDWorldToProj(TDDeform(P));
    vTexCoord = uv[0].st;    // Tex from POP → UV in MAT
    vNormal = N;              // glyph metadata packed in N
    vColor = Cd;              // Color from POP → Cd in MAT
}
```

## Étapes

### 1. Créer rectanglePOP dans render_geo
- 1×1 quad avec UVs

### 2. Déplacer dattoPOP dans render_geo (ou le connecter depuis l'extérieur)
- Le GLSL Copy POP a besoin de 2 inputs dans le même réseau

### 3. Créer GLSL Copy POP
- Input 0 : rectanglePOP
- Input 1 : dattoPOP (ou nullPOP connecté au dattoPOP externe)
- Point shader comme ci-dessus
- Output Attributes : `P Color Tex N`

### 4. nullPOP + render flag

### 5. Adapter le GLSL MAT
- Vertex : lire Tex et N au lieu de TDInstanceCustomAttrib0()
- Fragment : identique mais lire N au lieu de vGlyphData

### 6. Supprimer poptoSOP et instancing

### 7. Profiling
- Mesurer avec perform CHOP (vrai FPS)
- Tester à fontsize=10 (18K chars)
- Comparer : poptoSOP (1039ms) vs GLSL Copy POP (cible <1ms)

## Alternative propre : TDBuffer dans le GLSL MAT

Au lieu d'abuser N, le GLSL MAT peut lire les attributs POP via les POP Buffers (page Buffer du GLSL MAT) :
```glsl
// Dans le vertex shader du GLSL MAT
float gw = TDBuffer_glyph_w(gl_VertexID);
float gh = TDBuffer_glyph_h(gl_VertexID);
float w  = TDBuffer_W(gl_VertexID);
```
À tester : les POP Buffers fonctionnent-ils pour le rendu POP direct (render flag) ? Si oui, c'est la solution propre. Sinon, fallback sur le hack N.

## Risques

1. **Accès attributs custom dans GLSL Copy POP** : `TDIn_charwidth(1, ci)` confirmé par docs Context7 — fonctionne pour tout attribut
2. **Tex attribute du rectanglePOP** : doit avoir des UVs 0→1. À vérifier, sinon utiliser un gridPOP 1×1
3. **TDBuffer dans GLSL MAT** : à tester pour rendu POP direct. Fallback : packer dans N
4. **dattoPOP dans render_geo** : le GLSL Copy POP a besoin de ses 2 inputs dans le même réseau. Peut nécessiter de déplacer le dattoPOP dans render_geo ou d'utiliser un Input POP pour relayer l'input externe
