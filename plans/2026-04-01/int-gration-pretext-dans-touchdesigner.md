<!-- session_id: 4367b9fc-0147-4dea-9072-f9fff141cd5c -->
# Plan: Intégration Pretext dans TouchDesigner

## Context

Le but est d'intégrer [chenglou/pretext](https://github.com/chenglou/pretext) — une lib JS de layout de texte multiligne via Canvas API — dans TouchDesigner pour obtenir du texte rendu en temps réel avec déplacement/animation via TOP.

**Contrainte clé**: Pretext utilise l'API Canvas du navigateur pour mesurer les caractères. Il ne tourne pas en Node pur sans polyfill `node-canvas`. Le **Web Render TOP** (Chromium embarqué) est donc le chemin naturel.

**Limitation Web Render TOP**: `executeJavaScript(script)` est fire-and-forget (pas de valeur de retour). Pas de bridge `window.td` natif. Pour renvoyer des données structurées (positions par caractère), il faut un workaround (Web Server DAT via `fetch()`).

---

## Architecture recommandée: Option 2 — Web Render TOP

### Phase 1: Rendu visuel + displacement (pas de data-back)

```
[text_source] Text DAT (l'utilisateur édite ici)
      │
      ▼
[inject_text] DAT Execute ──executeJavaScript──▶ [webrender1]
      
[pretext_page] Text DAT (HTML) ──source DAT──▶ [webrender1] Web Render TOP
                                                       │
                                                       ▼ input 0
[noise1] Noise TOP ──input 1──▶ [displace1] Displace TOP
                                       │
                                       ▼
                                 [out1] Null TOP
```

**8 opérateurs**, zéro dépendance externe côté TD.

### Phase 2 (optionnelle): Instancing par caractère

Ajoute un Web Server DAT qui reçoit le JSON des positions depuis le browser via `fetch()`, parsé dans une Table DAT, puis converti en CHOP pour l'instancing sur un Geo COMP.

---

## Étapes d'implémentation

### Step 1: Créer la page HTML Pretext

Fichier `web/pretext/pretext_page.html` — page autonome:
- Import ESM depuis `https://esm.sh/@chenglou/pretext`
- Canvas plein écran, fond transparent
- Fonction globale `window.updateText(text, font, maxWidth, lineHeight)`
- Rendu via `ctx.fillText()` ligne par ligne depuis `layoutWithLines()`
- Flag `window.pretextReady = true` posé après le chargement du module ESM
- Fond transparent tant que Pretext n'est pas chargé (état "loading" implicite)

Tester d'abord dans Chrome standalone avant de charger dans TD.

### Step 2: Créer le réseau TD (via MCP)

| Opérateur | Type | Config clé |
|-----------|------|------------|
| `text_source` | Text DAT | Texte initial "Hello Pretext" |
| `pretext_page` | Text DAT | Contenu = le HTML de Step 1 |
| `webrender1` | Web Render TOP | `source`=DAT, `dat`=pretext_page, `transparent`=On, `alwayscook`=Off (cuira 10 frames après chaque update, suffisant car le Displace anime via Noise indépendamment) |
| `inject_text` | DAT Execute DAT | Watch `text_source`, callback `onTextChange` |
| `noise1` | Noise TOP | 2 channels (R/G), animated |
| `displace1` | Displace TOP | Input 0=webrender1, Input 1=noise1, weight ~0.03 |
| `out1` | Null TOP | Sortie propre |

### Step 3: Callback d'injection texte

`inject_text` DAT Execute — `onTextChange`:
```python
def onTextChange(dat):
    import json
    wr = op('webrender1')
    # Guard: ne pas injecter avant que Pretext soit chargé
    if not wr.loaded:
        return
    text = json.dumps(dat.text)  # safe escaping
    wr.executeJavaScript(f'if(window.pretextReady) window.updateText({text})')
```

- `json.dumps` gère l'échappement des quotes, backslashes, unicode, newlines
- Double guard: `wr.loaded` côté Python + `window.pretextReady` côté JS (le module ESM peut mettre quelques secondes à charger depuis le CDN)

### Step 4: Chaîne de displacement

- `noise1`: type Simplex, monochrome=Off, period animé via `absTime.seconds * 0.3`
- `displace1`: weight X/Y ~0.02-0.05, midpoint 0.5
- Résolutions alignées sur `webrender1`

### Step 5 (Phase 2, optionnel): Data-back pour instancing

- `layout_server` Web Server DAT (port libre, ex: 9982)
- HTML modifié: après `layoutWithLines()`, `fetch('http://localhost:9982/layout', {method:'POST', body: JSON.stringify(chars)})`
- Callback parse le JSON → remplit `layout_data` Table DAT
- Table → CHOP → Geo COMP instancing

---

## Vérification

1. Ouvrir `pretext_page.html` dans Chrome, console: `updateText('Test', '48px sans-serif', 800, 56)` → texte blanc visible
2. Dans TD: `webrender1` viewer montre le texte, `webrender1.loaded` = True
3. Éditer `text_source` → le texte se met à jour dans `webrender1` en <1 frame
4. `out1` montre le texte déplacé par le noise
5. (Phase 2) `layout_data` se remplit avec les positions après chaque changement

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| CDN `esm.sh` indisponible | Bundler Pretext localement dans le HTML (inline) |
| Latence Web Render TOP (1-2 frames) | Acceptable pour du motion design |
| Phase 2: fetch() async décale les positions de 1-2 frames vs le rendu visuel | Invisible en motion design ; si critique, encoder les positions en pixels dans un 2e canvas |
| Chargement initial CDN (quelques secondes) | Guard `window.pretextReady` + `wr.loaded` dans le callback ; fond transparent = pas d'artefact |
| Fonts custom | Charger via `@font-face` dans le HTML |
| Résolution canvas ≠ TOP | Aligner `canvas.width/height` sur `window.innerWidth/Height` |
