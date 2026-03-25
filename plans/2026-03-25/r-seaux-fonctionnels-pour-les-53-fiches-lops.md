<!-- session_id: 6ce21031-d411-4bae-bd0c-5f80f704d359 -->
# Réseaux fonctionnels pour les 53 fiches LOPs

## Context

Les 53 Geo COMPs dans `/ProjectName/World` contiennent chacun une copie du LOP + un `info` DAT. Il faut maintenant câbler chaque LOP avec ses I/O et des exemples pré-remplis pour que chaque scène soit directement testable.

48/53 LOPs ont un paramètre `Chattd` qui doit pointer vers `/dot_lops/ChatTD`.

## Patterns de réseau par catégorie

### Pattern A : Chat/LLM textuel (14 LOPs)
`Chat, ChatSession, Summarize, Caption, Handoff, RoleCreator, Sentiment, SafetyCheck, GeminiImageGen, Search, SerperSearch, FalAI, Lyria, ACEstep`

Réseau :
```
[Table DAT "sample_input"] → LOP → [Null DAT "output"]
                                  → [info DAT]
```
- `sample_input` : Table DAT pré-remplie avec conversation/prompt exemple
- LOP : `Chattd` → `/dot_lops/ChatTD`, paramètres exemple pré-remplis
- `output` : Null DAT connecté à la sortie du LOP

### Pattern B : Manipulation de conversation (6 LOPs)
`AddMessage, HoldChat, RedefineRoles, Feedback, DATText, DATChatTable`

Réseau :
```
[Table DAT "sample_conversation"] → LOP → [Null DAT "output"]
```
- `sample_conversation` : Table avec colonnes `role | message | id | timestamp`
- Pas besoin d'API — opérations locales

### Pattern C : Contexte / Viewer (3 LOPs)
`ChatViewer, ContextGrabber, WebViewer`

- `ChatViewer` : [Table DAT conversation] → LOP (résolution 1280x720)
- `ContextGrabber` : Configuré avec un Text DAT exemple en source
- `WebViewer` : URL exemple ou Markdown source DAT

### Pattern D : Tools (7 LOPs)
`ToolDAT, ToolRegistry, ToolParameter, ToolMonitor, ToolDebugger, ToolVfs, ToolOpContext`

Réseau :
```
LOP (configuré avec des refs vers d'autres ops de la scène)
[info DAT]
```
- `ToolDAT` : Target DAT pointant sur un Table DAT "sandbox" dans la scène
- `ToolParameter` : Target OP pointant sur un Null COMP avec des custom pars
- Les autres : paramètres par défaut suffisants

### Pattern E : Audio STT/TTS/VAD (6 LOPs)
`STTWhisper, STTKyutai, STTAssemblyai, TTSElevenlabs, TTSKyutai, VADSilero`

Réseau :
```
[Audio Device In CHOP] → [Null CHOP "audio_in"] → LOP → [Null DAT/CHOP "output"]
```
- Audio Device In : capte le micro
- LOP connecté via `ReceiveAudioChunk()` ou input direct
- Note : STT/TTS nécessitent des packages Python installés + API keys

### Pattern F : RAG (8 LOPs)
`RAGIndex, RAGRetriever, SourceDocs, SourceGithub, SourceWebscraper, SourceCrawl4ai, SourceOps, SaveSources`

Réseau :
```
LOP (configuré avec un path/URL exemple)
[info DAT]
```
- `RAGIndex` : Document Folder pointant vers un dossier exemple
- `RAGRetriever` : RAG Index OP pointant vers RAGIndex scene
- `SourceDocs` : File Pattern `*.md *.txt`
- `SourceGithub` : URL repo exemple
- `SourceWebscraper/Crawl4ai` : URL exemple
- `SourceOps` : Root = `..` (le Geo COMP lui-même)
- `SaveSources` : Output Folder configuré

### Pattern G : Vision (2 LOPs)
`Florence, OCR`

Réseau :
```
[Noise TOP "sample_image"] → LOP → [Null DAT "output"]
```
- Noise TOP comme image source placeholder
- LOP connecté via input TOP

### Pattern H : Controllers (3 LOPs)
`PythonManager, MCPClient, MCPServer`

Réseau minimal (configuration only) :
- `PythonManager` : Pas d'I/O, juste les paramètres
- `MCPClient` : Config file path exemple
- `MCPServer` : Server Code DAT avec un exemple @mcp.tool()

### Pattern I : Templates (2 LOPs)
`ABase, AContainer` — Pas de réseau supplémentaire (ce sont des templates vides)

### Pattern J : Utils standalone (2 LOPs)
`TokenCount, BugReport`
- `TokenCount` : [Text DAT "sample_text"] → LOP
- `BugReport` : standalone

## Exécution

**Étape 1 :** Pointer tous les `Chattd` vers `/dot_lops/ChatTD` (48 LOPs, 1 script)

**Étape 2 :** Batches par pattern :
- Script A : Pattern A (14 LOPs) — table input + null output + params exemple
- Script B : Pattern B (6 LOPs) — conversation table + null output
- Script C : Pattern C+G (5 LOPs) — viewers et vision
- Script D : Pattern D (7 LOPs) — tools avec refs
- Script E : Pattern E (6 LOPs) — audio chain
- Script F : Pattern F (8 LOPs) — RAG avec paths/URLs
- Script G : Pattern H+I+J (7 LOPs) — controllers, templates, utils

## Données exemples

### Conversation sample (Pattern A/B)
```
role     | message                          | id | timestamp
system   | You are a helpful assistant.     | 1  | 2025-01-01 00:00:00
user     | What is TouchDesigner?           | 2  | 2025-01-01 00:00:01
assistant| TouchDesigner is a visual...     | 3  | 2025-01-01 00:00:02
```

### Text sample (TokenCount, Summarize)
```
TouchDesigner is a node-based visual programming language for real-time interactive multimedia content...
```

## Vérification

- [ ] Tous les `Chattd` pointent vers `/dot_lops/ChatTD`
- [ ] Chaque scène a ses I/O câblés
- [ ] Les exemples sont pré-remplis
- [ ] Sélectionner une scène LOP affiche son réseau via LOPViewer
- [ ] Les scènes 3D existantes fonctionnent toujours
- [ ] 0 erreurs nouvelles
