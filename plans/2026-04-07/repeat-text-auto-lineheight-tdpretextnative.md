<!-- session_id: 709faa1f-4f19-45d9-af2b-d667c4f7a662 -->
# Plan : Repeat Text + Auto Lineheight — TDPretextNative

## Contexte

L'utilisateur veut deux nouvelles fonctionnalites sur TDPretextNative :
1. **Repeat Text** : repeter le texte d'entree jusqu'a remplir toute la fenetre (en tenant compte de font size, line height, padding, obstacles)
2. **Auto Lineheight** : toggle qui calcule automatiquement le lineheight optimal a partir du fontsize

Ces deux features sont purement au niveau du layout engine — aucun changement sur l'atlas, les shaders, ou le glyph_script.

---

## Feature 1 : Repeat Text (`Repeattext`)

### Principe

Le main loop de `onFrameEnd` s'arrete quand `word_idx >= nw` (texte epuise). Avec repeat ON, au lieu de sortir, on reset `word_idx = 0` et `char_offset = 0` pour recommencer depuis le debut.

**Zero copie de donnees** — on reutilise les memes arrays `_words`, `_word_w`, `_char_list`, `_char_w_array`. C'est juste un reset de pointeur.

### Changements dans `layout_engine` (`onFrameEnd`)

1. Lire le parametre :
```python
repeat_text = bool(comp.par.Repeattext) if hasattr(comp.par, 'Repeattext') else False
```

2. Dans le while loop, ajouter le wrap au debut du corps de boucle :
```python
resets = 0
while y < H - padding:
    if word_idx >= nw:
        if not repeat_text or nw == 0:
            break
        if resets > 200:  # safety cap
            break
        word_idx = 0
        char_offset = 0
        resets += 1
    
    # ... reste du code existant (segments, layout_line, place_word) ...
```

3. **Separateur entre copies** : le texte se termine naturellement par un mot, et `_layout_line` skip les espaces en debut de ligne. Pour eviter que le dernier mot colle au premier sur la meme ligne, on ajoute `_space_width` apres le reset :
```python
# dans la boucle de placement des segments, apres le reset :
# le skip des leading spaces dans la boucle existante gere deja ca
# MAIS si le texte ne finit pas par un espace, il faut en injecter un
```
En fait, la logique existante gere deja les espaces entre mots. Mais si le texte source ne contient pas d'espace final, le dernier mot d'une copie collera au premier mot de la copie suivante. Solution simple : dans `_rebuild_cache`, si repeat est ON et que le texte ne finit pas par un espace, ajouter un espace virtuel a la fin de `_words`.

**Alternative plus simple** : ajouter une variable `needs_gap` qui injecte `_space_width` sur le curseur `cx` au premier mot apres un reset.

### Garde contre boucle infinie

- `resets > 200` : cap hard (200 repetitions = texte tres court dans une grande fenetre)
- `nw == 0` : texte vide, break immediat
- Le max_inst (8000) dans `_place_word` stoppe naturellement le placement

### Parametre TD

- Nom : `Repeattext`
- Type : Toggle (bool)
- Page : Config
- Default : False
- Label : "Repeat Text"

---

## Feature 2 : Auto Lineheight (`Autolineheight`)

### Principe

Quand ON, `line_height = fontsize * 1.3` au lieu de lire `comp.par.Lineheight`.

Le facteur 1.3 (130%) est le standard typographique pour du texte lisible (entre 1.2 tight et 1.5 loose).

### Changements dans `layout_engine` (`onFrameEnd`)

Remplacer :
```python
line_height = float(comp.par.Lineheight) if hasattr(comp.par, 'Lineheight') else 50
```

Par :
```python
auto_lh = bool(comp.par.Autolineheight) if hasattr(comp.par, 'Autolineheight') else False
if auto_lh:
    line_height = font_size * 1.3
else:
    line_height = float(comp.par.Lineheight) if hasattr(comp.par, 'Lineheight') else 50
```

### Parametre TD

- Nom : `Autolineheight`
- Type : Toggle (bool)
- Page : Config
- Default : False
- Label : "Auto Lineheight"
- Position : juste apres `Lineheight` pour grouper visuellement

---

## Fichiers modifies

| Fichier | Modification |
|---------|-------------|
| `/TDPretextNative` (custom pars) | Ajouter `Repeattext` et `Autolineheight` toggles sur page Config |
| `/TDPretextNative/layout_engine` | Lire les 2 params, wrap word_idx pour repeat, calcul auto lineheight |

**Aucun changement sur** : atlas_script, glyph_script, text_vert, text_frag, text_glsl, glyph_metrics

---

## Verification

1. `Repeattext` ON + texte court ("hello") : le texte remplit toute la fenetre
2. `Repeattext` ON + texte vide : pas de freeze/boucle infinie
3. `Repeattext` ON + preset displaced : le texte contourne bien l'obstacle et continue a se repeter
4. `Autolineheight` ON : espacement correct et lisible
5. Les deux ON ensemble : texte repete avec bon espacement
6. Les deux OFF : comportement identique a avant (regression zero)
7. `screenshot_operator` sur `render_text` pour verifier visuellement
