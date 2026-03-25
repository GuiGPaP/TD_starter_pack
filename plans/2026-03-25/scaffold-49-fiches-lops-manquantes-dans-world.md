<!-- session_id: 6ce21031-d411-4bae-bd0c-5f80f704d359 -->
# Scaffold 49 fiches LOPs manquantes dans World

## Context

Le projet TD "LOPs guide" (`/ProjectName`) est un guide interactif avec un `World` (Geo COMP) contenant des fiches démo. Chaque fiche est un Geo COMP avec un Text DAT `info` (description HTML). Le menu `Scene` sur World + l'extension `extWorld` gèrent la navigation entre fiches.

Actuellement World contient 116 entrées (principalement des démos SOP natives). Seuls ~3 LOPs ont une vraie fiche (Agent, Feedback). **49 opérateurs LOPs n'ont aucune fiche.**

L'objectif : créer les 49 Geo COMPs vides (scaffold) avec le bon nommage et un `info` DAT pré-rempli, prêts à être complétés manuellement dans TD.

## Plan

### Script Python unique via MCP (`execute_python_script`)

Un seul script qui pour chacun des 49 LOPs manquants :

1. **Crée un Geo COMP** dans `/ProjectName/World` nommé d'après le label LOP (ex: `Chat`, `MCP_Client`, `Summarize`)
2. **Ajoute un Text DAT `info`** avec un template HTML minimal :
   ```html
   <header><h1>{Label}</h1><p class="intro">{opType} — LOP operator</p></header>
   <section><p>TODO: Add description and example.</p></section>
   ```
3. **Positionne le COMP** sur une grille (colonne dédiée LOPs, Y décrémenté de 375 par fiche)
4. **Désactive le rendu** (`par.render = False`) pour ne pas perturber la scène active

### Données des 49 LOPs (depuis `OP_fam` DAT, vérifié live)

Organisés par catégorie pour un positionnement logique :

**Controllers (6)** : MCP Client, MCP Server, Python Manager
**LLM (17)** : Chat, Chat Session, Chat Viewer, Add Message, Hold Chat, Summarize, Translate, Sentiment, Caption, Context Grabber, Handoff, Role Creator, Redefine Roles, Safety Check, Tool DAT, Tool Registry, Tool Parameter, Tool Monitor, Tool Debugger, Tool Vfs, Tool Op Context
**Pipelines (14)** : Florence, OCR, Fal AI, ACEstep, GeminiImageGen, Lyria, Search, Serper Search, STT Whisper, STT Kyutai, STT AssemblyAI, TTS ElevenLabs, TTS Kyutai, VAD Silero
**RAG (8)** : RAG Index, RAG Retriever, Source Docs, Source Github, Source Webscraper, Source Crawl4ai, Source Ops, Save Sources
**Utils (7)** : DAT Text, DAT Chat Table, A Base, A Container, Web Viewer, Token Count, Bug Report

### Nommage des COMPs

Utiliser le `label` du LOP en PascalCase sans espaces (cohérent avec les fiches existantes `Agent`, `Feedback`) :
- `Chat`, `ChatSession`, `ChatViewer`, `AddMessage`, `HoldChat`...
- `MCPClient`, `MCPServer`
- `STTWhisper`, `TTSElevenlabs`, `VADSilero`...

### Positionnement

Les LOPs existants (Agent) sont vers X=2675. Placer les nouveaux à partir de X=3200 en 4 colonnes (une par catégorie), Y décrémenté de 375 par fiche.

## Mode d'exécution

- **`safe-write`** — crée des nœuds, pas de delete ni filesystem
- **Script unique** — une seule exécution MCP, pas 49 appels séparés
- Le script lit d'abord les noms existants dans World pour éviter les doublons

## Vérification

- [ ] `get_td_nodes /ProjectName/World` — 49 nouveaux Geo COMPs visibles
- [ ] Chaque nouveau COMP contient un `info` Text DAT avec le template HTML
- [ ] Le menu `Scene` de World liste les nouvelles entrées
- [ ] La scène active (Agent) n'est pas perturbée
- [ ] Aucune erreur dans le projet
