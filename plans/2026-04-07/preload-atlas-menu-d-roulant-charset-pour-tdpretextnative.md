<!-- session_id: 1dc81be0-6c83-4660-8251-ac85a62a00cc -->
# Plan : Preload Atlas — Menu déroulant charset pour TDPretextNative

## Context

L'atlas actuel ne contient que les caractères présents dans `text_source`. Quand un nouveau caractère apparaît en runtime, l'atlas doit être reconstruit → lag visible. L'utilisateur veut pouvoir précharger un jeu complet de caractères au démarrage, avec un bon lag initial plutôt que des micro-lags en cours de route.

## Approche

Ajouter un **custom parameter menu** `Atlascharset` sur le comp `/TDPretextNative` avec 4 options :

| Valeur | Label | Comportement |
|--------|-------|-------------|
| `dynamic` | Dynamic (text only) | Comportement actuel — seuls les chars du texte |
| `ascii` | ASCII (32-126) | 95 caractères imprimables |
| `latin` | Latin Extended | ASCII + accents/diacritiques (~200 chars) |
| `unicode` | Unicode BMP Common | Latin + cyrillique + grec + symboles (~600+ chars) |

## Fichier critique

- `/TDPretextNative/atlas_script` — le script TOP callbacks qui génère l'atlas

## Modifications

### 1. Ajouter le custom parameter via MCP

Ajouter `Atlascharset` (StrMenu) sur le comp `/TDPretextNative` avec les 4 valeurs. Default = `dynamic` (pas de changement de comportement par défaut).

### 2. Modifier `atlas_script` — extraction des caractères

Dans `onCook()`, remplacer :
```python
unique_chars = list(dict.fromkeys(raw_text))
```

Par une logique qui lit `comp.par.Atlascharset` :
- `dynamic` → comportement actuel (chars du texte)
- `ascii` → `[chr(i) for i in range(32, 127)]`
- `latin` → ASCII + Latin-1 Supplement (U+00C0–U+00FF) + Latin Extended-A (U+0100–U+017F)
- `unicode` → latin + Greek (U+0370–U+03FF) + Cyrillic (U+0400–U+04FF) + General Punctuation + Math symbols

Les chars du texte sont toujours **inclus** (union du preset + texte réel), pour ne jamais manquer un caractère.

### 3. Rebuild trigger

Le `text_watcher` ne change pas — il trigger déjà `atlas_top.cook(force=True)`. Il faudra aussi trigger un rebuild quand `Atlascharset` change. On peut ajouter un `onValueChange` dans un parexecDAT ou utiliser une expression, mais le plus simple : ajouter le par change dans le `text_watcher` ou utiliser un parexecDAT dédié.

→ **Option retenue :** Ajouter un `parexecDAT` minimal qui watch `Atlascharset` et appelle `_rebuild()` (même pattern que `text_watcher`).

## Vérification

1. Mettre `Atlascharset` sur `latin` → vérifier que `glyph_metrics` contient ~200+ lignes
2. Changer le texte pour inclure un `é` → pas de rebuild (déjà dans l'atlas)
3. Remettre sur `dynamic` → `glyph_metrics` ne contient que les chars du texte
4. Vérifier que le rendu est correct avec chaque mode

## Estimation atlas

| Mode | Chars | Slices (2D Array) | ~VRAM à RENDER_SCALE=3 |
|------|-------|--------------------|------------------------|
| dynamic | ~30-80 | 30-80 | ~1-3 MB |
| ascii | 95 | 95 | ~3.5 MB |
| latin | ~200 | ~200 | ~7 MB |
| unicode | ~600 | ~600 | ~22 MB |
