<!-- session_id: f134bad3-cff5-496f-ba38-b1d449406646 -->
# Plan : P1 — FPS drops au hover dans ui_main

## Context

Après le P0 (allowCooking toggle — appliqué), on observe des légers drops de FPS quand la souris survole les éléments d'interface. Le diagnostic révèle un problème structurel lié à la complexité des widgets Palette.

## Diagnostic

### Chiffres clés

| Métrique | Valeur |
|----------|--------|
| Total opérateurs dans ui_main | **1001** |
| Widgets Palette (widget/button/slider) | 35 |
| Rollover/overlay containers | **55** |
| Cooks accumulés par les rollovers | 4156 |
| Cook time accumulé par les rollovers | 5.7 secondes |
| Profondeur max de nesting | **8 niveaux** |
| Ops au niveau 5-7 (le gros) | 756 (~75% du total) |

### Cause racine

Chaque widget Palette Basic (knobFixed, slider2D, button, folderTabs) embarque ~30-40 opérateurs internes : extensions Python, rollover containers, overlays, panelexec, opexec, replicators, code/menu/output bases, etc.

Au hover souris :
1. Le `rollover` container du widget sous la souris cook (réagit au panelValue)
2. Ce cook remonte 8 niveaux de parents (knob0 → knobFixed → knob_mid_L → col_left → knobs_grid → top_row → page_mixer → ui_main)
3. Chaque pixel de mouvement = nouveau cook du rollover
4. Avec 55 rollover/overlay containers, un balayage rapide de la souris déclenche des centaines de cooks

### Top consommateurs hover

| Widget | Rollover cooks | Chemin |
|--------|---------------|--------|
| knob_mid_L/knob0 | 464 | page_mixer/top_row/knobs_grid/col_left/ |
| knob_low_L/knob0 | 442 | page_mixer/top_row/knobs_grid/col_left/ |
| pad_left/slider2D overlay | 343 | page_pads/pads_row/ |
| knob_mid_R/knob0 | 320 | page_mixer/top_row/knobs_grid/col_right/ |

## Options

### Option A : Réduire la profondeur de nesting (impact modéré, effort moyen)

Le nesting actuel est :
```
ui_main / page_mixer / top_row / knobs_grid / col_left / knob_mid_L / knobFixed / knob0 / rollover
  1          2           3          4            5           6            7          8        (internal)
```

On peut aplatir la structure en supprimant les niveaux intermédiaires de layout (`top_row`, `knobs_grid`, `col_left/col_right`). Les widgets seraient placés directement dans la page avec un positionnement absolu (nodeX/nodeY) ou un layout plus plat.

**Gain :** Réduit la chaîne de propagation de 8 à ~4-5 niveaux. Chaque cook du rollover remonte moins de parents.

**Risque :** Perte de la structure de layout responsive. Repositionnement manuel nécessaire.

### Option B : Désactiver les rollovers inutiles (impact ciblé, effort faible)

Les widgets Palette ont des rollovers pour le feedback visuel au hover (highlight, tooltip). Si ce feedback n'est pas nécessaire visuellement, on peut désactiver les containers `rollover` et `overlay` en mettant `allowCooking = False` ou `display = False` sur eux.

**Gain :** Supprime directement les 4156 cooks de rollover. Zéro cook au hover.

**Risque :** Plus de feedback visuel au survol (pas de highlight). L'interaction clic/drag fonctionne toujours car elle passe par le panel, pas le rollover.

### Option C : Accepter le comportement actuel (pas d'action)

Les drops de FPS au hover sont mineurs et inhérents au design des widgets Palette. En mode Perform (sans viewer réseau), l'impact est réduit. C'est le compromis standard de TD pour du prototypage rapide.

## Recommandation

**Option B** — c'est le meilleur ratio effort/impact. On peut cibler les rollovers les plus coûteux (knobs, pads) sans tout réécrire.

### Implémentation Option B

1. **Script pour désactiver les rollovers des knobs** (les plus lourds) :
```python
ui = op('/project1/ui_main')
for child in ui.findChildren(depth=10):
    if child.name == 'rollover' and child.isCOMP:
        child.allowCooking = False
```

2. **Vérifier visuellement** que les knobs/sliders fonctionnent toujours (clic + drag). Seul le highlight au survol disparaît.

3. **Si le feedback visuel est nécessaire**, Option A de repli : ne désactiver que les overlays inutiles, garder les rollovers des éléments interactifs principaux.

## Vérification

- Avant : hover sur les knobs → FPS drops visibles
- Après : hover sur les knobs → FPS stable, clic/drag toujours fonctionnel
- `get_performance` sur ui_main pour confirmer moins de cooks accumulés
