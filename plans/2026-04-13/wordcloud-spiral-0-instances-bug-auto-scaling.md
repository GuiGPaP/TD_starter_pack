<!-- session_id: 87cfca88-b886-4ab9-91af-161305f5b072 -->
# Fix wordcloud spiral — 0 instances bug + auto-scaling

## Context

Le placement spiral produit 0 instances. Root cause : les mots à `Wcmaxfontsize=80` (metrics at 80px) sont trop gros pour la silhouette webcam dans l'occupancy map basse résolution. Un mot "particles" fait ~50px en occupancy space mais la silhouette ne fait que ~40-60px de large. L'integral check strict (`s==0` = tout le bbox dans la silhouette) rejette tout.

## Fix en 3 parties

### 1. Auto-scale : adapter les tailles à la silhouette

Avant le placement, mesurer le bounding box de la silhouette dans l'occupancy et adapter les tailles des mots :

```python
# Mesurer la silhouette
valid_ys, valid_xs = np.where(occupancy == 0)
if len(valid_xs) == 0:
    return  # pas de silhouette
sil_w = (valid_xs.max() - valid_xs.min()) / OCC_S  # largeur en pixels render
sil_h = (valid_ys.max() - valid_ys.min()) / OCC_S

# Le mot le plus long ne doit pas dépasser 60% de la largeur silhouette
longest_word = max(word_list, key=lambda w: sum(_unique_widths.get(c, 10) for c in w[0]))
longest_px = sum(_unique_widths.get(c, 10) for c in longest_word[0])  # à scale=1
auto_max = sil_w * 0.6 / longest_px * max_font  # font size qui fait rentrer le mot
effective_max = min(max_font, auto_max)

# Recalculer les scales avec effective_max
for i, (word, old_scale, rotated) in enumerate(word_list):
    new_scale = old_scale * (effective_max / max_font)
    word_list[i] = (word, new_scale, rotated)
```

### 2. Fallback sans masque

Si pas de silhouette (webcam pas connectée, fond blanc pur), utiliser toute la surface :
```python
if len(valid_xs) == 0:
    occupancy[:] = 0  # tout l'espace est valide
```

### 3. Spiral plus robuste

- Augmenter `n_spiral` à 1500 (plus de positions testées)
- `sp_step = 0.2` (spirale plus serrée pour mieux couvrir les petites silhouettes)
- Augmenter `max_theta` si la silhouette est grande
- Ajouter un fallback : si spiral échoue pour un mot, essayer des positions aléatoires dans la silhouette

```python
if not placed:
    # Fallback: random positions inside silhouette
    for _ in range(50):
        ri = rng.randint(0, len(valid_xs))
        x, y = valid_xs[ri], valid_ys[ri]
        # check collision...
```

## Opérateurs à modifier

| Opérateur | Modification |
|-----------|-------------|
| `layout_engine` (executeDAT) | `_handle_wordcloud` : auto-scale + fallback + spiral robuste |

## Vérification

1. Avec webcam : mots placés dans la silhouette, tailles adaptées automatiquement
2. Sans masque : mots remplissent tout l'écran
3. Avec image banane comme masque : mots dans la forme banane
4. Performance : recompute < 100ms, FPS moyen > 50
5. Paramètres : Wcmaxfontsize/Wcminfontsize affectent les tailles relatives
