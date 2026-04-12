<!-- session_id: 709faa1f-4f19-45d9-af2b-d667c4f7a662 -->
# Plan : Analyse Performance TDPretextNative + Optimisations

## Contexte

Mesures prises sur ~400 frames a 60fps avec Repeat Text ON, preset displaced, texte "test".

## Mesures per-frame (deltas sur ~400 frames)

| Operator | ms/frame CPU | ms/frame GPU | Controlable ? |
|----------|-------------|-------------|---------------|
| **glyph_data** (scriptCHOP) | **~1.25ms** | 0 | OUI — Python per-sample write |
| **videodevin1** (webcam) | **~2.0ms** | 0 | NON — hardware |
| **nvbackground1** (NVIDIA BG) | ~0.08ms CPU | **~1.5ms GPU** | NON — inference IA |
| **render_text** (renderTOP) | ~0.8ms | ~0.4ms | Partiellement — depend nb instances |
| **instance_data_top** (CHOP→TOP) | ~0.36ms | 0 | Proportionnel a nb instances |
| layout_engine (executeDAT) | ~0.5ms* | 0 | OUI |
| Compositing (thresh+multiply+level+over) | ~0.1ms | ~0.3ms | OUI |

*layout_engine n'apparait pas directement dans les perf (executeDAT), son cout est inclus dans le frame overhead.

**Budget total estime : ~6-7ms/frame** (sur 16.6ms budget a 60fps)
**Marge : ~10ms** — confortable

## Top 3 goulots d'etranglement

### 1. glyph_data Script CHOP — ~1.25ms/frame (controlable)

Le plus gros cout controlable. Ecrit 12 canaux × N samples en boucle Python avec `chan[i] = value`. Avec repeat text ON et ~10-15k instances, ca monte a ~2-3ms.

**Optimisation possible :**
- **Court terme** : reduire le nombre de samples quand repeat OFF (texte court = peu d'instances). Deja fait avec max_inst dynamique.
- **Moyen terme** : batch write via numpy — ecrire les arrays directement au lieu de per-sample. Mais `chan.numpyArray()[:] =` est documente comme anti-pattern. Alternative : `scriptOp.copyNumpyArray()` n'existe pas sur Script CHOP.
- **Long terme** : migrer vers GLSL compute (SSBO) pour eliminer Python du hot path. Le layout_engine ecrit les instances en storage, un compute shader les lit et produit la texture d'instances directement. Elimine glyph_data + instance_data_top entierement.

### 2. videodevin1 — ~2.0ms/frame (non controlable)

Capture webcam. Cout hardware incompressible. Pas d'optimisation possible sauf baisser la resolution de capture.

### 3. nvbackground1 — ~1.5ms GPU (non controlable)

NVIDIA Background Removal. Inference GPU. Cout fixe par frame.

## Optimisations proposees par priorite

### A. Compositing conditionnel (facile, ~0.3ms gain)

`thresh1`, `multiply1`, `level1`, `over1` cookent a chaque frame meme quand le preset ne les utilise pas. Bypass conditionnel selon le preset actif.

**Fichiers** : parametres `bypass` sur ces 4 TOPs via expressions Python.

### B. Cache layout quand rien ne change (moyen, ~0.5ms gain)

Si le texte et l'obstacle n'ont pas change, le layout est identique au frame precedent. Ajouter un hash check dans `onFrameEnd` :
- Hash du bitmap alpha (deja fait partiellement dans le code actuel)
- Skip le layout complet si hash identique

**Fichier** : `/TDPretextNative/layout_engine`

### C. Optimiser glyph_script avec numpy batching (moyen, ~0.5-0.8ms gain)

Au lieu d'ecrire sample par sample, pre-construire des arrays numpy et ecrire en bulk. Meme si `numpyArray()[:] =` est documente comme anti-pattern, une alternative est possible :
- Construire les 12 arrays dans layout_engine (deja en numpy: out_x, out_y)
- Les stocker via `comp.store()`
- Dans glyph_script, utiliser `chan.vals = list(array)` ou tester si le bulk write fonctionne pour ce cas precis

**Fichiers** : `/TDPretextNative/layout_engine`, `/TDPretextNative/glyph_script`

### D. Migration GLSL compute (long terme, elimine ~2ms)

Remplacer glyph_data (Script CHOP) + instance_data_top (CHOP→TOP) par un compute shader qui lit les instances directement depuis un SSBO. Le layout_engine ecrirait un buffer texture au lieu de passer par Python.

**Impact** : elimine ~1.25ms (glyph_data) + ~0.36ms (instance_data_top) = ~1.6ms/frame
**Effort** : significatif (nouveau shader, nouveau pipeline de donnees)

## Recommandation

Le systeme tourne deja a 60fps avec ~10ms de marge. Les optimisations A et B sont les plus rentables (faciles, peu de risque). C et D sont pour du texte tres dense ou des machines moins puissantes.

## Verification

1. `get_performance` avant/apres chaque optimisation
2. Comparer les deltas de CPU Cook sur ~500 frames
3. Verifier visuellement que le rendu est identique
4. Tester avec repeat ON + long texte pour stress test
