<!-- session_id: c6293e83-abf6-40c6-9c51-a544e4e3e759 -->
# Plan : Améliorer l'alignement texte — mesure par mot (style Pretext)

## Contexte

Le layout engine actuel mesure chaque caractère individuellement avec `evalTextSize(char)`. Problèmes :
1. **Pas de kerning** : "To" mesuré comme width(T)+width(o) = 36px, mais en réalité c'est ~29px (kerning T→o)
2. **Arrondi entier** : `evalTextSize` retourne des entiers, erreur cumulative ~20px sur 50 chars
3. **Résultat** : justify trop espacé, bords écran/silhouette pas collés, texte "flottant"

## Approche : Mesure hybride mot + caractère

Comme Pretext mesure des segments entiers (mots) avec `measureText()`, on fait pareil avec `evalTextSize(word)` qui capture le kerning intra-mot dans TD.

### Principe

1. **Atlas** : garder le char-level atlas (un glyphe par caractère unique)
2. **Mesure** : ajouter un **word cache** — `evalTextSize(word)` pour chaque mot unique du texte
3. **Layout** : utiliser les largeurs de mots (pas de chars) pour le line-breaking → plus précis
4. **Placement** : dans chaque mot, distribuer les caractères proportionnellement à leurs largeurs individuelles, mais contraints par la largeur totale mesurée du mot

### Algorithme de placement (clé)

```python
# Mot "Typography" : 
#   word_width = evalTextSize("Typography") / RENDER_SCALE = 127.3px (avec kerning)
#   char_widths = [T=20, y=15, p=14, o=16, g=14, r=12, a=15, p=14, h=14, y=15] sum=149px
#   ratio = 127.3 / 149.0 = 0.854
#   
# Chaque char est placé avec: adjusted_width = char_width * ratio
# → Le mot entier occupe exactement 127.3px, kerning distribué proportionnellement
```

### Changements dans `atlas_script`

Ajouter après la génération du char atlas :
```python
# Mesurer les mots uniques
words = raw_text.split()
unique_words = list(dict.fromkeys(words))
word_widths = {}
for word in unique_words:
    sz = helper.evalTextSize(word)
    word_widths[word] = sz[0] / RENDER_SCALE  # float, avec kerning
comp.store('_word_widths', word_widths)
```

### Changements dans `layout_engine`

**`_rebuild_cache()` :** charger le word cache en plus des char widths

**Nouveau `_layout_line_words()` :** line-breaking par mots (comme l'original Pretext) :
```python
def _layout_line_words(start_idx, max_width):
    # Trouver les limites de mots dans _char_list
    # Accumuler les word_widths (pas les char widths)
    # Couper au dernier mot qui rentre
    # Retourner (end_idx, line_width_from_word_widths)
```

**Placement des chars :** pour chaque mot dans la ligne :
```python
word_text = ''.join(_char_list[word_start:word_end])
measured_w = _word_widths.get(word_text, sum of char widths)
char_sum = sum(_char_w_array[word_start:word_end])
ratio = measured_w / char_sum if char_sum > 0 else 1.0
# Place each char with width * ratio
```

### Changements dans `glyph_script`

Aucun changement — il reçoit toujours (x, y, char) depuis le storage.

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `/TDPretextNative/atlas_script` | Ajouter mesure des mots uniques, stocker dans `_word_widths` |
| `/TDPretextNative/layout_engine` | Nouveau line-breaking par mot + placement proportionnel |

## Impact attendu

| Aspect | Avant | Après |
|--------|-------|-------|
| Précision largeur ligne | ~93% (char sum, entiers) | ~99% (word measured, kerning) |
| Justify | espaces trop grands (slack mal calculé) | espaces naturels |
| Bords écran | texte ne touche pas le bord | texte colle au bord |
| Bords silhouette | gap irrégulier | suit le contour précisément |
| Performance | ~2.7ms/frame | ~3ms/frame (word lookup dict) |

## Vérification

1. Comparer visuellement displaced avant/après — les lignes doivent coller aux bords
2. Tester avec du texte contenant des paires kerning fortes : "AWAY", "Typography", "To the"
3. Vérifier que le justify produit des espaces réguliers et naturels
4. Tester les 4 presets (displaced, textface, cutout, editorial)
