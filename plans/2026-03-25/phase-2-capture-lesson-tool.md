<!-- session_id: 3451119f-8149-49e1-9ab0-c32018704301 -->
# Phase 2 — capture_lesson Tool

## Context

Phase 1 a livré le schema, le registry, les seed lessons, et les tools `search_lessons` / `get_lesson`. Phase 2 ajoute `capture_lesson` : l'utilisateur ou Claude décrit une leçon, le système la structure en JSON validé, l'écrit sur disque, et hot-reload le registry.

## Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `_mcp_server/src/core/constants.ts` | Ajouter `CAPTURE_LESSON` |
| `_mcp_server/src/features/lessons/idGenerator.ts` | **Nouveau** — `titleToId()` + dedup contre registry |
| `_mcp_server/src/features/lessons/writer.ts` | **Nouveau** — écriture builtin + sidecar |
| `_mcp_server/src/features/tools/handlers/lessonTools.ts` | Ajouter `capture_lesson` handler |
| `_mcp_server/tests/unit/lessons/writer.test.ts` | **Nouveau** — tests writer + idGenerator |

## Détails

### 1. `idGenerator.ts`

```typescript
titleToId(title: string): string
  → lowercase, strip non-alnum, spaces→hyphens, collapse, trim
  → doit matcher /^[a-z0-9][a-z0-9-]*$/

deduplicateId(id: string, registry: KnowledgeRegistry): string
  → si id existe, essaie id-2, id-3, etc.
```

### 2. `writer.ts`

```typescript
writeLessonToBuiltin(lesson: TDLessonEntry, knowledgePath: string): void
  → writeFileSync(join(knowledgePath, 'lessons', `${id}.json`), JSON.stringify(lesson, null, '\t'))

appendLessonToSidecar(lesson: TDLessonEntry, toePath: string): void
  → lit sidecar existant (array), append, réécrit
  → sidecar = `{projectName}.td-lessons.json`
```

Résolution du path : `resolveKnowledgePath(import.meta.url)` depuis `src/features/resources/paths.ts`.

### 3. `capture_lesson` tool schema

Params obligatoires : `title`, `category`, `summary`, `tags`
Params optionnels : `operatorChain`, `recipe`, `code`, `codeLanguage`, `symptom`, `cause`, `fix`, `relatedIds`, `projectName`, `confidence`, `saveTo` (builtin|project)

Workflow :
1. Générer ID depuis title + dedup
2. Construire `TDLessonEntry` complet
3. Valider via `lessonEntrySchema` (Zod parse)
4. Écrire sur disque (builtin ou sidecar)
5. Hot-add au registry (`registry.addEntry()`)
6. Retourner le détail formaté via `formatLessonDetail()`

### 4. Test round-trip

`capture_lesson` → `search_lessons` retrouve la lesson → `get_lesson` retourne le détail complet

## Vérification

- `npx tsc --noEmit` clean
- `npx vitest run tests/unit/lessons/` passes
- `npm run test:unit` — tous les tests passent
- Round-trip MCP : `capture_lesson` → `search_lessons` → `get_lesson`
