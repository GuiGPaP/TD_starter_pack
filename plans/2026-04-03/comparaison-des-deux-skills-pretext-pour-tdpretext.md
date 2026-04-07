<!-- session_id: 783dc15b-9c9d-4893-9ea9-dc58c8d22242 -->
# Comparaison des deux skills Pretext pour TDPretext

## Contexte

TDPretext intègre `@chenglou/pretext` dans TouchDesigner via Web Render TOP. Pour améliorer le workflow de développement avec Claude Code, on compare deux skills communautaires qui enseignent Pretext aux agents IA, afin de choisir lequel adopter (ou s'en inspirer pour un skill custom).

---

## Vue d'ensemble

| Critère | **AsharibAli/pretext-skills** | **yaniv-golan/pretext-skill** |
|---------|-------------------------------|-------------------------------|
| Structure | `pretext/SKILL.md` + `references/` (3 .md) + `examples/` (5 .ts) | `pretext/skills/pretext/SKILL.md` + `references/` (2 .md) |
| Taille contenu utile | ~30 KB (SKILL 5KB + refs 21KB + examples 4KB) | ~32 KB (SKILL 9KB + api 8.6KB + patterns 13.9KB) |
| Fichiers référence | `pretext-agents.md`, `pretext-readme.md`, `pretext-status.md` | `api.md`, `patterns.md` |
| Exemples code | 5 fichiers `.ts` séparés (copy-paste ready) | Code inline dans `patterns.md` |
| Infrastructure | Aucune (pure markdown) | CI GitHub Actions, versioning script, manifests Claude/Cursor, GitHub Pages |
| Installation | `npx skills add asharibali/pretext-skills` | Multi-plateforme (Claude Desktop, Cursor, Manus, ChatGPT, `.agents/skills/`) |
| Licence | Non spécifiée | MIT |

---

## Contenu et qualité

### SKILL.md (point d'entrée)

| | AsharibAli | yaniv-golan |
|-|------------|-------------|
| Taille | ~5 KB, concis | ~9 KB, détaillé |
| Approche | Guide rapide "deux chemins" (fast path vs rich path) | Guide complet avec "quand NE PAS utiliser" |
| Decision table | Oui (simple: fast vs rich) | Oui (8 API functions mappées aux use cases) |
| Gotchas | Section "Key Things to Get Right" (bullets) | Section dédiée avec exemples WRONG/CORRECT |
| Anti-patterns | Peu | Section "When NOT to Use" très détaillée |

**Verdict:** yaniv-golan est plus complet et mieux structuré pour éviter les erreurs. AsharibAli est plus rapide à consommer.

### Références API

| | AsharibAli | yaniv-golan |
|-|------------|-------------|
| Couverture API | Copie quasi-verbatim du README upstream | Réécriture agent-friendly avec types TS complets |
| Fonctions documentées | Toutes | Toutes les 8 + `profilePrepare` |
| Exemples par fonction | Partiels | Oui, chaque fonction a un snippet |

**Verdict:** yaniv-golan a une meilleure documentation API (réécrite, pas copiée).

### Patterns d'intégration

| | AsharibAli | yaniv-golan |
|-|------------|-------------|
| Patterns couverts | 5 (basic height, textarea, canvas, flow-around, shrink-wrap) | 8+ (wrapper module, auto-fit font, card height, obstacles, progressive enhancement, vendoring, ASCII art, magazine layout, streaming chat) |
| Format | Fichiers `.ts` séparés | Code inline dans `patterns.md` avec contexte "quand/pourquoi" |
| Pertinence TDPretext | `flow-around-image.ts` directement applicable | `layoutNextLine` loop + obstacles = notre use case exact |

**Verdict:** yaniv-golan couvre plus de patterns, dont certains directement pertinents (obstacles, shrink-wrap, streaming).

### Données de performance

| | AsharibAli | yaniv-golan |
|-|------------|-------------|
| Benchmarks | Oui, dans `pretext-status.md` (browser sweep, accuracy counts) | Inline dans SKILL.md (0.0002ms/layout, 19ms/500 prepares) |
| Format | Dashboard détaillé avec dates | Chiffres clés intégrés au guide |

**Verdict:** AsharibAli a un fichier dédié plus complet. yaniv-golan intègre les chiffres essentiels au bon endroit.

---

## Pertinence pour TDPretext

Notre use case spécifique :
- **Web Render TOP** = Chromium embedded, pas Node.js
- **Canvas rendering** (flow_page utilise canvas pour le texte)
- **Obstacle avoidance** (cercles géométriques + bitmap silhouette)
- **`layoutNextLine`** est notre API principale (boucle par ligne avec obstacles variables)
- **Performance critique** (sub-frame budget, ~16ms)

| Besoin TDPretext | AsharibAli | yaniv-golan |
|------------------|------------|-------------|
| layoutNextLine patterns | `flow-around-image.ts` | Section dédiée dans patterns.md |
| Canvas rendering | `canvas-manual-layout.ts` | Couvert dans patterns |
| Gotcha lineHeight px vs multiplier | Mentionné | WRONG/CORRECT avec code |
| "No Node.js without canvas" warning | Non | Oui (pertinent: confirme que notre approche Web Render est correcte) |
| Font loading timing | Mentionné | Détaillé (important pour Web Render TOP) |
| system-ui gotcha (macOS) | Mentionné | Détaillé |

---

## Recommandation

**Pour TDPretext, `yaniv-golan/pretext-skill` est le meilleur choix** pour les raisons suivantes :

1. **Documentation gotchas supérieure** -- le bug lineHeight pixel/multiplier et le timing font loading sont critiques dans notre pipeline Web Render TOP
2. **Patterns obstacles** directement applicables à notre `layoutNextLine` loop
3. **Anti-patterns documentés** -- évite les mauvaises pistes (TanStack Virtual, etc.)
4. **API réécriture agent-friendly** vs copie brute du README
5. **Multi-plateforme** -- fonctionne déjà avec Claude Code sans adaptation

**Points à prendre d'AsharibAli :**
- Les fichiers `.ts` séparés sont plus pratiques que le code inline pour le copy-paste
- Le dashboard de benchmarks (`pretext-status.md`) est un format utile à considérer

### Option alternative : skill custom TDPretext

On pourrait aussi créer un skill dédié qui combine :
- La base de yaniv-golan (API + gotchas + patterns)
- Des patterns spécifiques TD : Web Render TOP integration, bitmap obstacles, coordinate inversion, ESM ready handshake
- Les leçons apprises documentées dans nos memories (frame-delayed ops, double guard pattern, etc.)

---

## Prochaines étapes possibles

1. **Installer yaniv-golan** tel quel et l'utiliser comme référence
2. **Créer un skill TDPretext custom** qui wrape les connaissances Pretext + nos patterns TD spécifiques
3. **Contribuer upstream** nos patterns TD à l'un des deux repos
