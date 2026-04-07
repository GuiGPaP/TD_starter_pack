<!-- session_id: a9c53f41-0f2e-4063-aae0-7de0d779cd1e -->
# Plan: Intégrer Pretext dans TD via Web Render TOP (Issue #91)

## Context

Pretext (chenglou/pretext) est une lib JS de layout texte via Canvas API (~0.09ms/layout). On veut l'intégrer dans TouchDesigner via Web Render TOP pour créer des démos de texte interactif en temps réel. Inspirations : sachinkasana/pretext-demo (flow autour d'obstacles), pushmatrix/textstring (physique lettres), pretext.cool.

## État actuel

- `/TDPretext` container existe avec `mcp_webserver_base` (port 9981, MCP server)
- Dossier : `C:\Users\guill\Desktop\TD_starter_pack\TDpretext\`
- TD 099.2025.31760 ouvert

## Architecture : 3 démos dans `/TDPretext`

### Demo 1 : Flow Around Obstacles (priorité)
Texte qui coule autour d'obstacles circulaires (souris + cercles animés).

### Demo 2 : Kinetic Displacement  
Rendu pretext simple + chaîne Noise→Displace TD-native.

### Demo 3 : Data Back + Instancing (Phase 2)
Positions par caractère renvoyées via fetch() → Web Server DAT → instancing 3D.

---

## Step 1 : HTML page — flow_demo

Créer `/TDpretext/web/flow_demo.html` — page autonome Canvas :
- Import ESM `https://esm.sh/@chenglou/pretext@0.0.3`
- Canvas plein écran, fond `#0b0b0f`
- `prepareWithSegments()` + cache par font+text
- `buildSegments()` — découpe lignes autour d'obstacles circulaires
- `layoutNextLine()` par segment
- `ctx.fillText()` par run
- Obstacles : pointeur souris + 2 cercles flottants (sin/cos drift)
- Orbes radial gradient sur chaque obstacle
- `window.updateText(text)` pour injection depuis TD
- `window.pretextReady = true` après chargement ESM
- Tester dans Chrome standalone d'abord

## Step 2 : Réseau TD — Demo 1 Flow

Créer dans `/TDPretext` :

| Opérateur | Type | Paramètres clés |
|-----------|------|-----------------|
| `text_source` | textDAT | Texte initial long (lorem pretext-style) |
| `flow_page` | textDAT | `file` = `web/flow_demo.html`, `syncfile` = On |
| `webrender_flow` | webrenderTOP | `source`=File, `url`=chemin vers flow_demo.html, `transparent`=Off (fond dark dans le HTML), `resolutionw`=1920, `resolutionh`=1080, `interactmouse`=On (pour mouse events natifs) |
| `inject_text` | datexecuteDAT | Watch `text_source`, callback injecte via `executeJavaScript` |
| `null_flow` | nullTOP | Sortie propre |

**inject_text callback** :
```python
def onTableChange(dat):
    import json
    wr = op('webrender_flow')
    text = json.dumps(op('text_source').text)
    wr.executeJavaScript(f'if(window.pretextReady) window.updateText({text})')
```

### Souris — interactMouse() (résolu)

Il n'existe **pas** de paramètre `interactmouse` sur le Web Render TOP. La méthode Python est :

```python
wr.interactMouse(u, v, leftClick=0, middleClick=0, rightClick=0,
                 left=False, middle=False, right=False, wheel=0, pixels=False)
```

- **Coords normalisées par défaut** : (0,0) = bas-gauche, (1,1) = haut-droite
- **`pixels=True`** : coords en pixels, origine bas-gauche
- Envoie un vrai événement mousemove au Chromium → les `document.addEventListener('mousemove')` JS le captent

**Implémentation** :
1. Créer un `mouseinCHOP` pour capter la souris TD
2. Créer un `chopexecuteDAT` (`mouse_to_webrender`) qui appelle `interactMouse()` à chaque sample
3. Le HTML garde son `document.addEventListener('mousemove')` natif — il reçoit les events
4. **Attention Y inversé** : TD normalise bas→haut, HTML haut→bas. Le Chromium embarqué devrait gérer la conversion, mais à tester.

```python
# mouse_to_webrender callback
def onValueChange(channel, sampleIndex, val, prev):
    mouse = op('mousein1')
    wr = op('webrender_flow')
    u = mouse['tx'].eval()  # normalized 0-1
    v = mouse['ty'].eval()  # normalized 0-1, bottom=0
    wr.interactMouse(u, v)
```

**Opérateurs souris à ajouter** :

| Opérateur | Type | Config |
|-----------|------|--------|
| `mousein1` | mouseinCHOP | defaults (tx, ty, lselect normalisés) |
| `mouse_to_webrender` | chopexecuteDAT | watch `mousein1`, appelle `interactMouse(u, v)` |

## Step 3 : Tester Demo 1

- [ ] `flow_demo.html` fonctionne dans Chrome standalone
- [ ] `webrender_flow` affiche le texte dans TD
- [ ] Mouse tracking fonctionne via `interactMouse()`
- [ ] Modifier `text_source` → texte se met à jour
- [ ] 60fps stable

## Step 4 : Demo 2 — Kinetic Displacement

Créer dans `/TDPretext` :

| Opérateur | Type | Paramètres clés |
|-----------|------|-----------------|
| `kinetic_page` | textDAT | HTML simplifié : pretext render statique, fond transparent |
| `webrender_kinetic` | webrenderTOP | `transparent`=On, 1920x1080 |
| `noise1` | noiseTOP | Simplex, monochrome=Off, `t`=`absTime.seconds*0.3` |
| `displace1` | displaceTOP | input0=webrender_kinetic, input1=noise1, dispx/dispy=0.03 |
| `null_kinetic` | nullTOP | Sortie |

## Step 5 : Demo 3 — Data Back + Instancing (Phase 2)

| Opérateur | Type | Notes |
|-----------|------|-------|
| `instance_page` | textDAT | HTML pretext + `fetch('http://localhost:9982/layout', {method:'POST', body: JSON.stringify(chars)})` |
| `webrender_instance` | webrenderTOP | Rendu visuel |
| `layout_server` | webserverDAT | Port 9982, callback parse JSON → `layout_data` |
| `layout_data` | tableDAT | Colonnes: char, x, y, width, line |
| `dat_to_chop` | datToCHOP | Convertir positions |
| `geo1` | geoCOMP | Instancing depuis CHOP |
| `text_instance` | textTOP | Texture par caractère pour instances |

## Fichiers à créer/modifier

- **Créer** : `TDpretext/web/flow_demo.html`
- **Créer** : `TDpretext/web/kinetic_demo.html`  
- **Créer** : `TDpretext/web/instance_demo.html` (Phase 2)
- **Modifier** : Réseau TD via MCP (create_td_node, update_td_node_parameters, set_dat_text, connect_nodes)

## Vérification

1. Ouvrir `flow_demo.html` dans Chrome → texte visible, obstacles interactifs
2. Dans TD : `webrender_flow` viewer → texte animé
3. Modifier `text_source` → update en temps réel
4. Demo 2 : displacement visible sur `null_kinetic`
5. Demo 3 : `layout_data` se remplit avec positions caractères

## Risques

## Décisions d'architecture (issues du feedback)

### Source HTML : source=DAT (choisi)
- `file://` bloque les imports ESM → éliminé
- `source=DAT` fonctionne, le Chromium embarqué charge les ESM depuis esm.sh
- Pour Demo 3 (fetch data-back), il faudra passer en HTTP local (Web Server DAT même origin) pour éviter CORS

### Handshake ready
Le HTML a un texte par défaut. L'injection TD ne remplace que sur changement de `text_source`.
Pour l'init propre : le `inject_text` DAT Execute doit **aussi** être triggé au démarrage.
Option : ajouter un `run(delayFrames=120)` dans un script d'init qui appelle `_inject_text()` après que la page ait eu le temps de charger l'ESM (~2-3s).

### Demo 3 throttling
Ne renvoyer les positions via fetch() que sur changement de texte, pas à chaque frame. Le layout ne change que si le texte ou les obstacles changent significativement.

## Risques

| Risque | Mitigation |
|--------|-----------|
| CDN esm.sh indisponible | Bundle pretext inline si besoin |
| Souris : Y inversé TD vs HTML | Tester, ajuster v → 1-v si nécessaire |
| Latence fetch() Phase 2 (1-2 frames) | Throttle sur changement de texte seulement |
| ESM load ~2-3s au démarrage | Texte par défaut dans le HTML, init delayed |
