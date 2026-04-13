<!-- session_id: 87cfca88-b886-4ab9-91af-161305f5b072 -->
# Nettoyage preset wordcloud — tous paramètres fonctionnels

## Context

Le preset wordcloud coule du texte DANS la silhouette avec couleur depuis image et rotation mixte. Mais la plupart des paramètres Wc* n'ont aucun effet. L'utilisateur veut que TOUS les paramètres marchent, notamment les tailles variables par fréquence (comme un vrai word cloud, mais en mode flow).

---

## Comportement cible

Texte qui **coule dans la silhouette** (comme textface) avec :
1. **Taille variable** : chaque mot a une taille proportionnelle à sa fréquence dans le texte
2. **Couleur depuis image** : chaque caractère prend la couleur du pixel de l'image sous lui
3. **Rotation mixte** : certains mots sont verticaux (90°)
4. **Dynamique** : re-layout chaque frame (réagit aux obstacles en mouvement)

---

## Paramètres et leur rôle en mode flow

| Paramètre | Rôle en flow | Implémentation |
|-----------|-------------|----------------|
| `Wcmaxfontsize` | Taille du mot le + fréquent | Atlas rendu à cette taille. Instance scale=1.0 pour le mot top. |
| `Wcminfontsize` | Taille du mot le – fréquent | Instance scale = min/max pour les mots rares |
| `Wcmaxwords` | Limite de mots uniques à afficher | Tronquer la liste de fréquences au top N |
| `Wcrelativescaling` | Courbe de variation taille (0=uniforme, 1=linéaire) | `ratio = (count/max_count) ** rel_scaling` |
| `Wcpreferhorizontal` | % de mots horizontaux (0=tout vertical, 1=tout horizontal) | Déjà câblé ✓ |
| `Wccolorfromimage` | Toggle couleur depuis image | Déjà câblé ✓ |
| `Wcmasktop` | TOP source couleur | Fixer wiring vers `res_wc_color` |
| `Wcinputmode` | `text` (auto-count) ou `table` (DAT) | Parser fréquences depuis text_source ou table DAT |
| `Wcwordtable` | Référence au Table DAT (mode table) | Lire les fréquences depuis le DAT |

### Paramètres à supprimer (vraiment inutiles en flow)

| Paramètre | Raison |
|-----------|--------|
| `Wcspiralstep` | Spécifique à la spirale, pas de sens en flow |
| `Wcoccupancyscale` | Spécifique à l'occupancy map spirale |
| `Wcpadding` | Remplacé par `Padding` de la page Config |

---

## Plan d'implémentation

### 1. Atlas : render à `Wcmaxfontsize`

Remettre dans `atlas_script` le branchement :
```python
if preset == 'wordcloud':
    font_size = float(comp.par.Wcmaxfontsize)
```
Les mots plus petits utilisent le scaling d'instance GPU (downscale net).

### 2. Fréquences → taille par mot dans `_handle_wordcloud`

Nouveau flux dans `_handle_wordcloud` :

```python
# 1. Parser les fréquences (mode text ou table)
if input_mode == 'table':
    word_counts = {row['word']: row['weight'] for row in table}
else:
    word_counts = Counter(clean_words)  # auto-count

# 2. Trier par fréquence, limiter à Wcmaxwords
sorted_words = sorted(word_counts, key=freq, reverse=True)[:max_words]

# 3. Mapper fréquence → scale per word
for word, count in sorted_words:
    ratio = (count / max_count) ** rel_scaling
    scale = min_font / max_font + (1.0 - min_font / max_font) * ratio
    word_scale_map[word] = scale
```

### 3. Flow layout avec tailles variables

Le flow existant utilise `_char_w_array` et `_word_w` (tailles fixes). Pour les tailles variables :
- Chaque mot a un `scale` entre `min_font/max_font` et `1.0`
- La largeur effective d'un mot = `_word_w[wi] * scale`
- La hauteur effective = `char_height * scale`
- Le `line_height` s'adapte au mot le plus grand de la ligne courante

**Approach** : dans la boucle de flow, avant de placer un mot :
1. Lookup `scale = word_scale_map.get(word_text, 1.0)`
2. Ajuster les dimensions : `effective_word_w = _word_w[wi] * scale`
3. Placer les chars avec `sx = wpx * scale, sy = hpx * scale` dans l'instance tuple
4. `line_height` pour cette ligne = max des hauteurs des mots placés

**Complexité** : la line_height variable rend le flow plus complexe. Approche pragmatique : utiliser `Wcmaxfontsize` pour le line_height (toutes les lignes ont la même hauteur = celle du plus grand mot possible). Les mots petits sont centrés verticalement dans la ligne.

### 4. Fixer Wcmasktop → res_wc_color

Remplacer le code de reconnexion dynamique par un selectTOP :
- Créer `select_wc_color` (selectTOP) avec `top.expr = "parent().par.Wcmasktop"`
- `res_wc_color` (resolutionTOP 192x108) prend son input du selectTOP
- `_read_wc_color_image` lit simplement depuis `res_wc_color`

### 5. Supprimer les 3 paramètres morts

`Wcspiralstep`, `Wcoccupancyscale`, `Wcpadding` → `par.destroy()`

### 6. Nettoyer le code mort

- Supprimer `_place_word_vertical` (inutilisée)
- Supprimer `import Counter` si plus nécessaire (non, on en a besoin pour les fréquences)

---

## Opérateurs TD à modifier

| Opérateur | Action |
|-----------|--------|
| `/TDPretextNative` (COMP) | Supprimer 3 pars mortes, garder 9 |
| `atlas_script` (textDAT) | Remettre `if preset=='wordcloud': font_size = Wcmaxfontsize` |
| `layout_engine` (executeDAT) | Ajouter parsing fréquences, word_scale_map, flow avec scale variable |
| `glyph_script` (textDAT) | Déjà supporte le scale per-instance ✓ |
| `select_wc_color` (selectTOP) | **Créer** — `top.expr = "parent().par.Wcmasktop"` |
| `res_wc_color` (resolutionTOP) | Reconnecter en aval du selectTOP |

---

## Vérification

| Test | Résultat attendu |
|------|-----------------|
| `Wcmaxfontsize` = 80, `Wcminfontsize` = 10 | Mots fréquents gros, rares petits |
| `Wcrelativescaling` = 0 | Tous les mots même taille |
| `Wcrelativescaling` = 1 | Grande variation de taille |
| `Wcmaxwords` = 10 | Seulement top 10 mots (les autres ignorés) |
| `Wcinputmode` = table + DAT | Fréquences manuelles depuis le DAT |
| `Wcmasktop` changé | Couleurs changent |
| `Wccolorfromimage` off | Couleur uniforme |
| `Wcpreferhorizontal` = 0.5 | ~50% vertical |
| FPS | ≥ 45 FPS |
