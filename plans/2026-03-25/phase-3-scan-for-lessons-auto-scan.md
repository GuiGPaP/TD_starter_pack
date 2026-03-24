<!-- session_id: 3451119f-8149-49e1-9ab0-c32018704301 -->
# Phase 3 — scan_for_lessons (Auto-Scan)

## Context

Phase 2 a livré `capture_lesson`. Phase 3 ajoute `scan_for_lessons` : scan automatique du projet TD ouvert pour détecter des patterns et pitfalls, avec option de capture automatique.

Pattern suivi : `package_project` (Option B) — le TS handler génère un script Python, l'exécute via `tdClient.execPythonScript()`, et traite le résultat côté TS. Pas de nouvel endpoint OpenAPI.

## Architecture

```
scan_for_lessons (TS tool, withLiveGuard)
  → génère script Python (scanLessonScript.ts)
  → tdClient.execPythonScript({ script, mode: "read-only" })
  → Python walk l'arbre d'opérateurs dans TD
  → retourne JSON structuré (graphe, connexions, params, erreurs)
  → TS detector.ts analyse le JSON → candidats lessons
  → si autoCapture: true → writeLessonToBuiltin() + registry.addEntry()
```

## Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `_mcp_server/src/core/constants.ts` | Ajouter `SCAN_FOR_LESSONS` |
| `_mcp_server/src/features/lessons/scanLessonScript.ts` | **Nouveau** — génère le script Python de scan |
| `_mcp_server/src/features/lessons/detector.ts` | **Nouveau** — règles heuristiques de détection |
| `_mcp_server/src/features/tools/handlers/lessonTools.ts` | Ajouter `scan_for_lessons` handler avec `withLiveGuard` |
| `_mcp_server/tests/unit/lessons/detector.test.ts` | **Nouveau** — tests des règles de détection |

## Détails

### 1. `scanLessonScript.ts` — Python script generator

Génère un script Python qui :
- Walk `op(rootPath).findChildren(maxDepth=N)`
- Pour chaque op : type, family, inputs/outputs (connexions), erreurs
- Détecte les structures spécifiques :
  - Feedback loops (Feedback TOP dans la chaîne)
  - Instancing configs (Geometry COMP avec instanceCHOP)
  - CHOP exports (CHOPs avec export flag)
  - Resolution mismatches (TOPs connectés avec résolutions différentes)
- Retourne `result = { operators: [...], connections: [...], anomalies: [...], errors: [...] }`

Mode d'exécution : `read-only` (aucune écriture).

### 2. `detector.ts` — Pattern detection

```typescript
interface ScanData {
  operators: Array<{ path: string; opType: string; family: string }>;
  connections: Array<{ from: string; to: string; fromOutput: number; toInput: number }>;
  anomalies: Array<{ path: string; type: string; detail: string }>;
  errors: Array<{ path: string; message: string }>;
}

interface LessonCandidate {
  category: "pattern" | "pitfall";
  title: string;
  summary: string;
  confidence: "low" | "medium";
  operatorChain: Array<{ opType: string; family: string }>;
  tags: string[];
  matchesExisting?: string;  // ID d'une lesson existante si doublon
}

function detectLessons(data: ScanData, registry: KnowledgeRegistry): LessonCandidate[]
```

Règles Phase 3 :

| Règle | Catégorie | Détection |
|-------|-----------|-----------|
| Feedback loop | pattern | feedbackTOP dans connections cycle |
| GLSL + Feedback | pattern | glslTOP connecté à feedbackTOP |
| Instancing | pattern | geometryCOMP avec instancechop param non-vide |
| CHOP → param export | pattern | CHOP avec connection vers un COMP/TOP (export) |
| Orphan operators | pitfall | ops sans aucune connexion |
| Error-state ops | pitfall | ops avec erreurs actives |

Dé-duplication : compare `operatorChain` + `tags` avec lessons existantes via registry search.

### 3. Tool handler `scan_for_lessons`

Schema :
```typescript
{
  rootPath?: string,      // default "/project1"
  maxDepth?: number,      // default 5
  autoCapture?: boolean,  // default false (preview only)
}
```

Workflow :
1. `withLiveGuard` vérifie TD online
2. Génère script Python via `generateScanLessonScript(rootPath, maxDepth)`
3. Exécute via `tdClient.execPythonScript({ script, mode: "read-only" })`
4. Parse le résultat → `ScanData`
5. Passe à `detectLessons(scanData, registry)` → `LessonCandidate[]`
6. Si `autoCapture` : pour chaque candidat sans `matchesExisting`, appelle `writeLessonToBuiltin()` + `registry.addEntry()`
7. Formate et retourne les candidats

## Vérification

| Test | Méthode |
|------|---------|
| `detector.ts` avec mock ScanData → candidats corrects | Unit test |
| Script Python valide (pas d'erreur de syntaxe) | Vérification manuelle |
| `scan_for_lessons` sur TD live → retourne des candidats | Test MCP live |
| `autoCapture: true` → lessons apparaissent dans `search_lessons` | Round-trip test |
| `npm run test:unit` — tous passent | CI |
