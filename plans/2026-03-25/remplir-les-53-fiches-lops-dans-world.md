<!-- session_id: 6ce21031-d411-4bae-bd0c-5f80f704d359 -->
# Remplir les 53 fiches LOPs dans World

## Context

53 Geo COMPs scaffold existent dans `/ProjectName/World` avec un `info` DAT minimal ("TODO"). La doc officielle de chaque opérateur a été récupérée depuis dotdocs.netlify.app. Il faut :
1. Copier l'instance LOP depuis `/dot_lops/custom_operators/{name}` dans chaque COMP
2. Réécrire le `info` DAT avec la doc officielle (description, paramètres clés, I/O)

## Mécanisme d'instanciation

Les LOPs se copient depuis `/dot_lops/custom_operators/`. Chaque master a un tag `LOP` + `{name}LOP`. On utilise `parent.copy(source)` pour instancier dans le Geo COMP.

## Exécution en 3 batches MCP

Chaque batch = un script `execute_python_script` en mode `safe-write` qui :
1. Pour chaque entrée du batch, copie le master LOP dans le Geo COMP
2. Réécrit le `info` Text DAT avec le HTML enrichi

### Batch 1 : Controllers (3) + LLM (21) = 24

| Comp | Master | Description courte |
|------|--------|--------------------|
| PythonManager | AA | Manages external Python libraries via isolated venvs |
| MCPClient | mcp_client | Connects to external MCP servers, discovers tools |
| MCPServer | mcp_server | Exposes Python functions as MCP tools via stdio/http |
| Chat | chat | Create/edit/manage AI conversations with role-based messages |
| ChatSession | chat_session | Multi-agent chat session manager with rounds and roles |
| ChatViewer | chat_viewer | Renders chat conversations in a web browser view |
| AddMessage | add_message | Dynamic insertion of messages into conversation tables |
| HoldChat | hold_chat | Conditionally queues messages based on hold states |
| Summarize | summarize | AI-powered summarization of conversations/tables/text |
| Translate | translate | Offline translation via argostranslate (30+ languages) |
| Sentiment | sentiment | Text sentiment analysis with multiple backends |
| Caption | caption | Image-to-text conversion using LLMs |
| ContextGrabber | context_grabber | Aggregates context from TOPs, DATs, files for LLMs |
| Handoff | handoff | LLM-powered conversation router between specialized agents |
| RoleCreator | role_creator | Dynamically generates system prompts/personas |
| RedefineRoles | redefine_roles | Reassigns message role classifications |
| SafetyCheck | safety_check | Toxicity detection and profanity filtering |
| ToolDAT | tool_dat | AI agent manipulation of Table/Text DATs |
| ToolRegistry | tool_registry | Centralized discovery and assignment of LOP tools |
| ToolParameter | tool_parameter | Exposes operator parameters as AI-callable tools |
| ToolMonitor | tool_monitor | Tracks user activity in TD networks for agents |
| ToolDebugger | tool_debugger | Examines and validates LOPs tool schemas |
| ToolVfs | tool_vfs | Sandboxed virtual file system for agents |
| ToolOpContext | tool_op_context | Intelligent context analysis about TD operators |

### Batch 2 : Pipelines (14) + RAG (8) = 22

| Comp | Master | Description courte |
|------|--------|--------------------|
| Florence | florence | Microsoft Florence-2 vision model (captioning, detection, OCR) |
| OCR | ocr | Text extraction from images via EasyOCR/PaddleOCR + SideCar |
| FalAI | fal_ai | fal.ai image/video generation (FLUX, Stable Diffusion) |
| ACEstep | acestep | Music generation foundation model client |
| GeminiImageGen | geminiimagegen | Image generation via Google Gemini models |
| Lyria | lyria | Real-time music generation via Google DeepMind Lyria |
| Search | search | Unified web search (Tavily, Firecrawl, Brave, Exa, Serper) |
| SerperSearch | serper_search | DEPRECATED — use Search operator instead |
| STTWhisper | stt_whisper | Real-time speech-to-text via faster-whisper |
| STTKyutai | stt_kyutai | Real-time STT via Kyutai Moshi (English/French) |
| STTAssemblyai | stt_assemblyai | Real-time STT via AssemblyAI streaming API |
| TTSElevenlabs | tts_elevenlabs | Text-to-speech via ElevenLabs API (WebSocket streaming) |
| TTSKyutai | tts_kyutai | Real-time TTS via Kyutai Moshi neural model |
| VADSilero | vad_silero | Real-time voice activity detection via Silero |
| RAGIndex | rag_index | Creates vector store indices from documents |
| RAGRetriever | rag_retriever | Retrieves relevant context from a RAG Index |
| SourceDocs | source_docs | Parses local files (HTML, Python) for RAG |
| SourceGithub | source_github | Ingests GitHub repos (docs, issues, PRs, code) for RAG |
| SourceWebscraper | source_webscraper | Automated web content extraction with crawling |
| SourceCrawl4ai | source_crawl4ai | Web extraction via crawl4ai + Playwright headless browsers |
| SourceOps | source_ops | Extracts TD operator relationships/parameters for RAG |
| SaveSources | save_sources | Exports table data to individual Markdown files |

### Batch 3 : Utils (7)

| Comp | Master | Description courte |
|------|--------|--------------------|
| DATText | dat_text | LOP DAT text passthrough |
| DATChatTable | dat_chat_table | LOP DAT chat table passthrough |
| ABase | a_base | LOP base component template |
| AContainer | a_container | LOP container component template |
| WebViewer | web_viewer | Web browser + Markdown renderer in TD |
| TokenCount | token_count | Token estimation for LLM cost management |
| BugReport | bug_report | Diagnostic tool for LOPs troubleshooting |

## Info DAT HTML template

```html
<header>
    <h1>{Display Label}</h1>
    <p class="intro">{opType} — {Category}</p>
</header>
<section>
    <h2>Description</h2>
    <p>{Full description from docs}</p>
</section>
<section>
    <h2>Inputs / Outputs</h2>
    <p>{I/O description}</p>
</section>
<section>
    <h2>Key Parameters</h2>
    <ul>
        <li><b>{label}</b> ({style}) — {description}</li>
    </ul>
</section>
<section>
    <h2>Requirements</h2>
    <p>{Dependencies, API keys, etc.}</p>
</section>
```

## Vérification

- [ ] Chaque COMP contient une copie du LOP master
- [ ] Chaque info DAT a la doc complète
- [ ] Pas d'erreurs nouvelles dans le projet
- [ ] La scène active (Agent) n'est pas perturbée
