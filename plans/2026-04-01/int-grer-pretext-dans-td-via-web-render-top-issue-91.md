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

**Question ouverte** : Est-ce que `interactmouse` du Web Render TOP forward les mousemove au Canvas ? Si oui, le mouse tracking est natif. Sinon, il faut injecter les coords via un Panel CHOP + executeJavaScript.

## Step 3 : Tester Demo 1

- [ ] `flow_demo.html` fonctionne dans Chrome standalone
- [ ] `webrender_flow` affiche le texte dans TD
- [ ] Mouse tracking fonctionne (interactmouse ou injection)
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

| Risque | Mitigation |
|--------|-----------|
| CDN esm.sh indisponible | Bundle pretext inline si besoin |
| Mouse events pas forwardés par Web Render TOP | Injecter coords via executeJavaScript + mouse CHOP |
| Latence fetch() Phase 2 (1-2 frames) | Acceptable en motion design |
| Web Render TOP `source=File` vs `source=DAT` | Tester les deux — File plus simple pour dev itératif |
