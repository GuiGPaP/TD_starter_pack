<!-- session_id: dbf6f0c2-ce4e-484c-b125-e4817fabc856 -->
# Audit Performance — TDPretextPop

## Context

TDPretextPop tourne a 60 FPS mais avec un cout CPU cumule tres eleve. Le profiling live revele des bottlenecks majeurs, surtout dans le pipeline de conversion DAT→POP→SOP et dans le cooking inutile d'operateurs non utilises par le preset actif.

## Profiling Live (60 FPS, preset ASCII actif)

| Operateur | CPU Total | Cooks | Cout/cook | Probleme |
|-----------|-----------|-------|-----------|----------|
| **inst_to_sop** (poptoSOP) | **165,234ms** | 48,822 | ~3.38ms | #1 — conversion POP→SOP inutile |
| **nvbackground1** (nvidia BG) | 6,457ms | 366,088 | ~0.02ms | Cook chaque frame meme si inutilise |
| **thresh1** (thresholdTOP) | 52ms frame / 388K cooks | 388,914 | - | Cook meme en mode obstacle=none |
| **dat_to_pop** (dattoPOP) | 16,137ms | 39,221 | ~0.41ms | Pipeline DAT→POP necessaire? |
| **multiply1, level1, over1** | ~225ms combine | ~380K cooks | - | Compositing inutile en ASCII |
| **atlas_3d** | 390ms CPU + 2,448ms GPU | 34,574 | - | 86MB VRAM |
| **render_text** | 370ms | 496,322 | - | 72.2MB — normal |

### Memoire GPU totale : ~167MB (atlas_3d 86MB + render_text 72MB + divers 9MB)

---

## Bottlenecks identifies (par priorite)

### 1. CRITIQUE — `inst_to_sop` (poptoSOP) : 165 secondes CPU

**Le probleme** : Le pipeline actuel est :
```
spec_dat (tableDAT) → dat_to_pop (dattoPOP) → null_inst (nullPOP) → inst_to_sop (poptoSOP) → render_geo (instancing)
```

Le `poptoSOP` convertit les points POP en geometrie SOP a chaque cook — c'est le #1 bottleneck CPU avec 3.38ms par cook.

**Fix propose** : Remplacer `dattoPOP + poptoSOP` par un `scriptSOP` ou `dattoSOP` direct. Le Geometry COMP peut instancier depuis n'importe quel SOP — pas besoin du detour par POP.

Alternative : utiliser un CHOP→TOP pour les donnees d'instance (comme TDPretextNative), ce qui elimine totalement le SOP.

**Gain estime** : ~3ms/cook → ~0.5ms/cook = **~2.5ms/frame economise**

### 2. ELEVE — Cooking inutile de la chaine compositing

**Le probleme** : En preset ASCII (obstaclemode='none'), ces operateurs cookent quand meme :
- `nvbackground1` : 6,457ms CPU (inference IA NVIDIA)
- `null_mask → res_obstacle → thresh1 → mask_alpha → switch1` : ~6,600ms frame cost
- `multiply1, level1, over1` : ~225ms

**Fix propose** : Bypass conditionnel via expressions Python sur le parametre `cook` ou `bypass` de chaque operateur, base sur `parent().par.Preset`:
```python
# Sur nvbackground1.par.bypass:
parent().par.Preset == 'ascii' or parent().par.Preset == 'none'
```

**Gain estime** : Elimination de ~6.5 secondes de frame cost + GPU freed

### 3. MOYEN — `dat_to_pop` : 16 secondes CPU

**Le probleme** : 39,221 cooks pour convertir spec_dat en points POP. Si on garde le pipeline POP, ce cout est incompressible.

**Fix** : Disparait si on applique le fix #1 (elimination du pipeline POP).

### 4. FAIBLE — Layout engine Python (compute_ascii_layout)

**Le probleme** : Double boucle Python `for row in range(rows): for col in range(cols)` avec :
- Sampling pixel par pixel : `img[vy, vx]`
- Calcul luminance en Python pur
- Append par caractere dans `_rows`
- String formatting par caractere

**Performance actuelle** : Attenuee par le frame_skip (1 cook sur 3), mais quand ca cook c'est ~2-5ms.

**Fix propose (phase 2)** : Vectoriser avec numpy :
```python
# Au lieu de double boucle:
ys = np.linspace(0, h-1, rows).astype(int)
xs = np.linspace(0, w-1, cols).astype(int)
grid = img[np.ix_(ys, xs)]  # (rows, cols, 4) en une op
lum = 0.299*grid[:,:,0] + 0.587*grid[:,:,1] + 0.114*grid[:,:,2]
indices = (lum * (pal_len-1)).astype(int).clip(0, pal_len-1)
```

**Gain estime** : ~2-5ms → ~0.2ms par cook

### 5. FAIBLE — Atlas 86MB VRAM

**Le probleme** : 128 slices de texture array. Seul ASCII (95 chars) est utilise.

**Fix optionnel** : Reduire `cachesize` a 96 pour ASCII. Gain : ~20MB VRAM.

---

## Shaders GLSL — Analyse

Les shaders sont **optimaux** :
- **Vertex** : TDDeform + TDWorldToProj + passthrough UV/color/glyph_data. Minimal.
- **Fragment** : 1 sample texture2DArray + UV centering + alpha discard. Rien a optimiser.
- Pas de branching couteux, pas de boucles, pas de dependent texture fetch complexe.

---

## Plan d'action

### Phase 1 — Quick wins (bypass conditionnel)
1. Ajouter bypass conditionnel sur `nvbackground1`, `thresh1`, `multiply1`, `level1`, `over1`, `res_obstacle` quand preset ne les necessite pas
2. Verifier que le rendu reste correct dans chaque preset apres bypass

### Phase 2 — Eliminer poptoSOP
1. Remplacer le pipeline `dat_to_pop → null_inst → inst_to_sop` par un `dattoSOP` direct ou scriptSOP
2. Mettre a jour `render_geo.par.instanceop` pour pointer vers le nouveau SOP
3. Verifier que les attributs d'instance (P, W, pscale, Cd, charwidth, glyph_w, glyph_h) passent correctement

### Phase 3 — Vectoriser compute_ascii_layout
1. Remplacer la double boucle Python par numpy vectorise
2. Batch write au lieu de append par caractere

### Verification
- `get_performance` scope `/TDPretextPop` avant/apres chaque phase
- Comparer cook counts et CPU total
- Verifier visuellement chaque preset (none, displaced, textface, ascii)
- Verifier que le 60 FPS est maintenu et que le frame cost diminue

---

## Fichiers concernes

| Fichier (DAT dans TD) | Modification |
|------------------------|-------------|
| `/TDPretextPop/frame_exec` | Logique bypass par preset |
| `/TDPretextPop/layout_engine` | Vectorisation numpy ASCII |
| `/TDPretextPop/nvbackground1` | Expression bypass |
| `/TDPretextPop/thresh1, multiply1, level1, over1, res_obstacle` | Expression bypass |
| `/TDPretextPop/render_geo` | Changer instanceop si pipeline change |
| `/TDPretextPop/dat_to_pop, null_inst, inst_to_sop` | A remplacer ou supprimer |
