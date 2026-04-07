<!-- session_id: c6293e83-abf6-40c6-9c51-a544e4e3e759 -->
# Plan : Fix TDPretextNative — Alignement gauche + Police baveuse

## Contexte

TDPretextNative affiche du texte avec obstacle avoidance via un pipeline natif TD (atlas + instancing GPU). Deux problèmes visuels :
1. **Alignement gauche irrégulier** — les lignes ne s'alignent pas au bord gauche (padding), contrairement au bord droit qui est correct
2. **Police baveuse/floue** — les caractères manquent de netteté

## Analyse

### Problème 1 : Alignement gauche

**Cause identifiée dans `layout_engine` (lignes skip-space + position cx) :**

Le layout engine saute les espaces uniquement entre les lignes (le `while char_idx < n and _char_list[char_idx] == ' '` avant la boucle de segments). Mais quand `_layout_line_fast` coupe une ligne, le curseur `char_idx` pointe souvent vers un espace (le séparateur de mot). Ce caractère espace est inclus dans la ligne suivante et **n'est pas sauté au début de chaque segment**.

Dans la boucle de placement des chars :
```python
cx = seg['x']
for i in range(char_idx, end_idx):
    ch = _char_list[i]
    cw = _char_w_array[i]
    if ch == ' ':
        cx += cw   # <-- L'espace avance cx, décalant tout le texte visible vers la droite
        continue
```

Résultat : les lignes qui commencent par un espace (après un word-break) ont leur premier caractère visible décalé de `space_width` pixels vers la droite → alignement gauche irrégulier.

**Fix :** Sauter les espaces au début de chaque segment (pas seulement entre les lignes), et aussi au début de chaque appel à `_layout_line_fast`.

### Problème 2 : Police baveuse

**Causes identifiées :**

1. **`evalTextSize` retourne des entiers** — Le code fait `int(sz[0]) + PAD * 2` pour la taille du tile. Mais `evalTextSize` arrondit déjà, et le `int()` tronque. Résultat : certains glyphes sont coupés (1px manquant) → bavure aux bords.

2. **Le quad affiché utilise `width_px / RENDER_SCALE` comme taille d'affichage** — Si la division n'est pas exacte (ex: 31px / 3 = 10.33px), le quad a une taille fractionnaire qui ne correspond pas exactement aux pixels de l'atlas → interpolation et flou.

3. **`atlas_top.filtertype = "linear"`** — L'atlas texture utilise un filtrage linéaire qui interpole entre les glyphes adjacents dans l'atlas quand les UVs ne tombent pas exactement sur les centres des texels. Avec un atlas de 4096x4096 et des petits glyphes, le PAD=4 devrait suffire, mais combiné avec les erreurs d'arrondi ci-dessus, ça empire le flou.

4. **Le render format est `rgba8fixed`** — C'est suffisant (8 bits), mais combiné avec le flag `dither = true` sur le render TOP, ça peut ajouter du bruit subtil au texte.

## Corrections

### Fix 1 : Alignement gauche — skip leading spaces per segment

**Fichier : `/TDPretextNative/layout_engine` (executeDAT)**

Dans la boucle de placement (après `for seg in segs:`), ajouter un skip des espaces avant d'appeler `_layout_line_fast` :

```python
for seg in segs:
    if char_idx >= n:
        break
    # Skip leading spaces at segment start
    while char_idx < n and _char_list[char_idx] == ' ':
        char_idx += 1
    if char_idx >= n:
        break
    end_idx, _ = _layout_line_fast(char_idx, seg['w'])
```

Et aussi, dans `_layout_line_fast`, s'assurer que le curseur ne commence pas sur un espace :

```python
def _layout_line_fast(start_idx, max_width):
    n = len(_char_list)
    # Skip leading spaces
    while start_idx < n and _char_list[start_idx] == ' ':
        start_idx += 1
    if start_idx >= n:
        return start_idx, 0.0
    ...
```

Retirer le skip d'espaces entre les lignes (redondant maintenant) :
```python
# SUPPRIMER ces lignes avant la boucle de segments :
# while char_idx < n and _char_list[char_idx] == ' ':
#     char_idx += 1
```

### Fix 2 : Police baveuse — améliorer la précision atlas

**Fichier : `/TDPretextNative/atlas_script` (Script TOP)**

a) Utiliser `math.ceil` au lieu de `int` pour les tailles de tiles :
```python
import math
# ...
w_px = math.ceil(sz[0]) + PAD * 2
h_px = math.ceil(sz[1]) + PAD * 2
```

b) Stocker la taille display arrondie proprement :
```python
# display size = exact atlas pixel size / RENDER_SCALE
disp_w = raw_w / RENDER_SCALE  # garder en float, pas arrondir
disp_h = raw_h / RENDER_SCALE
```

**Fichier : `/TDPretextNative/render_text` (Render TOP)**

c) Désactiver le dithering :
```python
render_text.par.dither = False
```

### Fix 3 (optionnel) : Anti-aliasing du texte

Le render TOP a `antialias = "aa4"` ce qui est bien. Si le texte reste un peu flou, on pourrait passer le format à `rgba16float` ou augmenter l'antialiasing, mais tester d'abord avec les fixes ci-dessus.

## Fichiers à modifier (via MCP)

| Opérateur | Type de fix |
|-----------|-------------|
| `/TDPretextNative/layout_engine` | Skip espaces per-segment + per-layout-line |
| `/TDPretextNative/atlas_script` | `math.ceil` au lieu de `int` pour tailles tiles |
| `/TDPretextNative/render_text` | `dither = False` |

## Vérification

1. Après les fixes, vérifier visuellement que le bord gauche du texte est parfaitement aligné (toutes les lignes commencent à `padding` pixels du bord)
2. Comparer la netteté du texte avant/après
3. Vérifier que le texte coule toujours correctement autour de l'obstacle (webcam/masque)
4. S'assurer que le nombre d'instances ne change pas drastiquement (les espaces sautés ne doivent pas créer de trous)
