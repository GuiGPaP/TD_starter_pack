<!-- session_id: f89a8430-942d-4e41-878d-13bb3bd268ee -->
# Audit complet TDPretext — 3 COMPs vs Pretext upstream

## Context

Le projet TDPretext implémente l'algorithme de text-flow de [@chenglou/pretext](https://github.com/chenglou/pretext) (v0.0.5, 41K stars, MIT) dans TouchDesigner via 3 approches distinctes. L'objectif final : du texte dense qui "coule" autour d'une silhouette (webcam/bitmap) à 60 FPS.

Pretext upstream a été mis à jour récemment (8 avril 2026) avec des optimisations de performance significatives (passes linéaires, correction emoji, support CJK étendu).

---

## 1. Pretext upstream — Algorithme clé

### Architecture deux phases
| Phase | Fonction | Coût | Détail |
|-------|----------|------|--------|
| **Préparation** | `prepareWithSegments(text, font)` | O(n), one-shot | Segmente via `Intl.Segmenter`, mesure via Canvas `measureText()`, cache les largeurs |
| **Layout** | `layoutNextLine(prepared, cursor, maxWidth)` | O(segments/ligne), ~0.0002ms | Arithmétique pure sur les largeurs cachées, zéro DOM |

### Obstacle avoidance — le pattern "carve slots"
La lib ne détecte PAS les obstacles elle-même. Elle fournit une primitive :
```
layoutNextLine(prepared, cursor, maxWidth)  → { text, end: LayoutCursor }
```
L'appelant doit :
1. Pour chaque ligne Y : calculer les zones bloquées (cercle→Pythagore, bitmap→scan horizontal)
2. Soustraire les zones bloquées du `[0, pageWidth]` → obtenir des "slots" disponibles
3. Appeler `layoutNextLine()` une fois par slot avec `maxWidth = slot.width`
4. Le curseur avance entre les appels → le texte continue naturellement

### Mises à jour récentes (v0.0.5, avril 2026)
- Préparation O(n) linéaire (était quadratique dans les cas dégénérés)
- Fusion arabe linéaire
- Correction emoji Safari/Chrome
- Support `rich-inline.ts` (chips, mentions, code spans)
- Empty-string layout: `{ lineCount: 0, height: 0 }`

---

## 2. Audit des 3 COMPs

### 2.1 TDPretext (Web Render TOP)

| Aspect | Détail |
|--------|--------|
| **Techno** | Chromium via Web Render TOP, Pretext.js ESM (v0.0.3) |
| **Layout** | `prepareWithSegments` + `layoutNextLine` natif JS |
| **Obstacles** | Circle (6 orbs animés) + Bitmap (spans injectés via `updateObstacleSpans()`) |
| **Rendu** | Canvas 2D (fillText), couleurs RGB par orbe |
| **Latence** | ~22 frames (pipeline Chromium) |
| **FPS** | ~30 FPS max |
| **Points forts** | Implémentation fidèle de Pretext, segmentation Unicode native, API clean |
| **Points faibles** | Latence inacceptable, CPU-bound, pas de shading GPU |
| **Fichier clé** | `TDpretext/web/flow_demo.html` (306 lignes) |
| **Version Pretext** | 0.0.3 (retard de 2 versions vs upstream 0.0.5) |

**Verdict** : Prototype de validation. Ne peut pas atteindre 60 FPS à cause de la latence Chromium incompressible.

### 2.2 TDPretextNative (Atlas + GPU Instancing)

| Aspect | Détail |
|--------|--------|
| **Techno** | Texture atlas 2048² + GLSL MAT instancing |
| **Pipeline** | textTOP → atlas shelf-packing → glyph_metrics tableDAT → layout Python → scriptCHOP → instancing |
| **Layout** | Python greedy line-breaking (port de l'algo Pretext) |
| **Obstacles** | Circle (sin/cos animés) + Bitmap (numpyArray + np.diff run detection) |
| **Rendu** | GLSL MAT vertex+fragment, quad instancé par caractère |
| **Latence** | 0 frame |
| **FPS** | 60 FPS (~6-7ms/frame, budget 16.6ms) |
| **Points forts** | Production-ready, RENDER_SCALE=3x, presets, charset preloading |
| **Points faibles** | Atlas rebuild coûteux au changement de font, scriptCHOP 1.25ms/frame |
| **Bottleneck** | glyph_data scriptCHOP (écriture Python par sample) |

**Breakdown performance** :
| Composant | ms/frame |
|-----------|----------|
| glyph_data (Script CHOP) | 1.25 |
| videodevin1 | 2.0 |
| nvbackground1 (NVIDIA AI) | 1.5 |
| render_text | 0.8 + 0.4 GPU |
| layout_engine | 0.5 |
| Compositing | 0.1-0.3 |
| **Total** | **~6-7ms** |

**Verdict** : Version la plus mature. Atteint 60 FPS. Marge d'optimisation ~3ms via numpy batch + conditional cook.

### 2.3 TDPretextPop (textPOP + GLSL Copy POP)

| Aspect | Détail |
|--------|--------|
| **Techno** | textPOP (specdat mode) + GLSL Copy POP + render direct POP |
| **Pipeline** | layout Python → spec_dat tableDAT → textPOP → GLSL Copy POP → nullPOP render=True |
| **Layout** | Même algorithme Python greedy que Native |
| **Obstacles** | Circle + Bitmap (GLSL POP GPU sampling du masque — Phase 2) |
| **Rendu** | constantMAT ou GLSL MAT, textPOP génère les meshes vectoriels |
| **Latence** | 0 frame |
| **FPS cible** | 60 FPS |
| **FPS actuel** | ~25 FPS @18K chars (en cours de debug) |
| **Points forts** | Résolution-indépendant (vectoriel), pas d'atlas pour text, obstacle masking GPU |
| **Points faibles** | UV mapping cassé, blending incorrect, presets non testés |
| **Bottleneck** | GLSL Copy POP UV passthrough, poptoSOP éliminé mais pas validé |

**Issues actives** :
1. **UV mapping cassé** — glyphes = rectangles gris (vertcomputemethod doit être custom)
2. **Blending** — halos sombres (pointcolorpremult doit être notpremult)
3. **Presets non testés** — les 4 presets doivent être vérifiés visuellement

**Verdict** : Architecture la plus prometteuse (GPU-first, vectoriel, pas d'atlas text) mais pas encore fonctionnelle.

---

## 3. Matrice comparative

| Critère | WebRender | Native | POP |
|---------|-----------|--------|-----|
| **Fidélité Pretext** | ★★★★★ (JS natif) | ★★★★ (port Python) | ★★★★ (même port) |
| **FPS @dense text** | 30 max | 60 | 25 (WIP) |
| **Latence** | 22 frames | 0 | 0 |
| **Qualité rendu** | Bonne (Canvas2D) | Excellente (3x) | Excellente (vectoriel) |
| **Atlas requis** | Non | Oui (rebuild coûteux) | Non (text presets) |
| **Obstacle GPU** | Non | Non (numpy CPU) | Oui (GLSL POP) |
| **Maturité** | Prototype | Production | En dev |
| **Maintenance** | Dépend Chromium | Stable | Stable |

---

## 4. Analyse des écarts vs Pretext upstream

### Ce qui est porté correctement
- Greedy line-breaking avec accumulation de largeurs ✅
- Obstacle avoidance par "carve slots" (cercle Pythagore + bitmap scan) ✅
- Cursor-based iteration (le texte continue entre les slots) ✅
- Hash-based layout caching (évite re-layout si rien ne change) ✅

### Ce qui manque dans les ports TD
1. **Segmentation Unicode** — Pretext utilise `Intl.Segmenter` pour CJK, Thai, Arabic. Le port Python utilise un split par mot simple (`text.split()`)
2. **Soft hyphens / tabs** — Non implémentés dans le port Python
3. **Fit vs Paint width** — Le port ne distingue pas (trailing spaces comptent dans la largeur)
4. **Rich inline** — `rich-inline.ts` (chips, mentions) pas porté
5. **Bidi** — Pas de support bidirectionnel
6. **Emoji correction** — Pas de correction d'inflation Canvas
7. **Version gap** — WebRender utilise v0.0.3, upstream est à v0.0.5 (perfs + bugfixes)

### Impact des écarts
- Pour du texte latin dense (cas d'usage principal) : **impact faible** — le greedy line-breaking fonctionne bien
- Pour du texte CJK/arabe/mixte : **impact fort** — la segmentation mot-par-mot ne fonctionne pas
- Pour la perf : **impact moyen** — les optimisations O(n) de v0.0.5 comptent pour les textes très longs

---

## 5. Recommandation stratégique

### Court terme : finaliser TDPretextPop
1. Fix UV mapping (vertcomputemethod=custom, vertoutputattrs=Tex)
2. Fix blending (pointcolorpremult=notpremult, premult fragment)
3. Tester tous les presets
4. Profiler → identifier si 60 FPS est atteignable

### Moyen terme : aligner le layout engine
1. Mettre à jour `flow_demo.html` vers Pretext v0.0.5
2. Porter les optimisations O(n) de v0.0.5 dans le layout Python
3. Ajouter la distinction fit/paint width pour les trailing spaces

### Long terme : GPU layout
1. Migrer le layout engine Python vers GLSL compute (éliminer ~2ms CPU)
2. Obstacle detection + layout + rendering 100% GPU
3. Cible : 60 FPS avec texte dense + bitmap obstacle dynamique

---

## 6. Vérification

- [ ] Ouvrir `TDpretext.toe` et vérifier visuellement les 3 COMPs
- [ ] Lancer chaque preset, mesurer FPS avec `get_performance`
- [ ] Comparer le rendu text-flow avec la démo dragon de Pretext (https://aiia.ro)
- [ ] Valider les UV du TDPretextPop après fix
- [ ] Profiler le layout engine Python avec des textes de 5K+ mots
