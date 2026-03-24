<!-- session_id: c3cba092-b4ad-467c-91f6-f19055c51c4f -->
# Epic 11 — Modes de sécurité execute_python_script (#72, #73, #74, #75)

## Context

`execute_python_script` est le tool le plus puissant — exécution Python arbitraire dans TD, zéro garde-fou. L'objectif : ajouter des modes de sécurité (garde-fou d'usage, PAS une sandbox), un preview sans exécution, et un audit log en mémoire.

## Décision architecturale : tout côté TypeScript

L'analyse et le log se font dans le serveur MCP (Node.js), PAS côté Python/TD :
- Pas de changement OpenAPI, pas de régénération
- Fonctionne en docs-only (valider avant d'envoyer)
- Plus rapide (pas de roundtrip)
- Suffisant pour un garde-fou (pattern matching, pas d'AST complet)

## Nouveaux fichiers

| Fichier | Rôle |
|---------|------|
| `src/features/tools/security/types.ts` | Types partagés : ExecMode, Violation, AuditEntry, PreviewResult |
| `src/features/tools/security/scriptAnalyzer.ts` | Analyse pattern-based des scripts Python |
| `src/features/tools/security/auditLog.ts` | Ring buffer 100 entrées en mémoire |
| `src/features/tools/security/index.ts` | Barrel export |
| `src/features/tools/handlers/execLogTools.ts` | Tool `get_exec_log` (suit le pattern healthTools.ts) |
| `tests/unit/security/scriptAnalyzer.test.ts` | Tests analyseur |
| `tests/unit/security/auditLog.test.ts` | Tests ring buffer |

## Changements fichiers existants

| Fichier | Changement |
|---------|-----------|
| `src/core/constants.ts` | +`GET_EXEC_LOG` dans TOOL_NAMES |
| `src/features/tools/handlers/tdTools.ts` | Étendre schema (l.84) + réécrire handler execute_python_script |
| `src/features/tools/register.ts` | Instancier ExecAuditLog, passer à registerTdTools + registerExecLogTools |
| `src/features/tools/metadata/touchDesignerToolMetadata.ts` | +metadata pour mode/preview + get_exec_log |

---

## #73 — Paramètre `mode`

### Schema (tdTools.ts l.84)

```typescript
const execPythonScriptToolSchema = ExecPythonScriptBody.extend({
  ...detailOnlyFormattingSchema.shape,
  mode: z.enum(["read-only", "safe-write", "full-exec"])
    .describe("Execution mode: read-only (no writes), safe-write (no deletes/filesystem), full-exec (unrestricted)")
    .optional(),
  preview: z.boolean()
    .describe("Analyze script without executing")
    .optional(),
});
```

Défauts dans le handler : `mode = "full-exec"`, `preview = false`.

### Analyse (scriptAnalyzer.ts)

Pattern matching ligne par ligne (pas d'AST Python). Chaque pattern a un `minMode` requis.

**Patterns bloqués en read-only** (escalade vers safe-write) :
- `.par.X = ` (assignation param, mais pas `==`)
- `.create(`, `.copy(`, `.insertRow(`, `.appendRow(`
- `.connect(`
- `.text = ` (DAT write)

**Patterns bloqués en safe-write** (escalade vers full-exec) :
- `.destroy(`, `.delete(`
- `os.remove`, `os.unlink`, `os.rmdir`, `shutil.rmtree`
- `subprocess`, `os.system(`
- `exec(`, `eval(`, `compile(`, `__import__(`
- `open(` avec modes écriture
- `socket`, `urllib`, `requests.`
- `sys.exit`, `quit()`, `exit()`

**Toujours autorisé** (même en read-only) :
- Imports de `json`, `math`, `datetime`, `re`, `collections`
- Lecture d'attributs (`.name`, `.type`, `.path`, `.par.X.val`)
- `print()`, `len()`, `str()`, `dir()`

**Algorithme :**
1. Split en lignes, strip commentaires `#`
2. Pour chaque ligne, tester les patterns → collecter violations avec `{ line, description, category }`
3. `requiredMode` = max des escalades trouvées
4. `allowed` = `requiredMode <= requestedMode`

### Handler (tdTools.ts, handler execute_python_script)

```
1. Extraire { mode = "full-exec", preview = false, detailLevel, responseFormat, ...scriptParams }
2. Analyser le script → analysis
3. Si preview → retourner l'analyse formatée (voir #74)
4. Si !analysis.allowed → audit log "blocked" + retourner erreur structurée avec violations
5. Sinon → exécuter via tdClient.execPythonScript(scriptParams)
6. Audit log "executed" (ou "error" si catch)
7. Retourner résultat formaté
```

### Erreur structurée (mode bloqué)

```
execute_python_script: Script blocked by read-only mode.

Required mode: safe-write
Violations:
  L3: .par.tx = 5 — parameter assignment requires safe-write mode
  L7: op('/project1').create(baseCOMP) — .create() requires safe-write mode

Use mode="safe-write" or mode="full-exec" to allow this script.
```

---

## #74 — Preview

Quand `preview=true` :
1. Analyser le script (même logique que #73)
2. Retourner l'analyse sans exécuter
3. Audit log avec outcome "previewed"

### Format retour

```
Script preview (mode: read-only)

Status: BLOCKED (requires safe-write)
Detected patterns:
  L1: .par.tx = 5 [write] — parameter assignment
  L3: .create(baseCOMP) [write] — node creation

Confidence: high
Risk level: medium (write operations detected)
```

Confidence : `high` si pas de `eval`/`exec`/`getattr`, `medium` si boucles/variables, `low` si `eval`/`exec`.

---

## #75 — Audit log

### Ring buffer (auditLog.ts)

```typescript
interface AuditEntry {
  id: number;           // monotonic
  timestamp: string;    // ISO 8601
  script: string;       // tronqué (500 chars max) + redacted
  mode: ExecMode;
  preview: boolean;
  allowed: boolean;
  outcome: "executed" | "blocked" | "previewed" | "error";
  durationMs: number;
  violations?: Violation[];
  error?: string;       // redacted
}

class ExecAuditLog {
  private entries: AuditEntry[] = [];
  private nextId = 1;
  private readonly maxEntries = 100;

  append(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry;
  getEntries(opts?: { limit?: number; outcome?: string; mode?: ExecMode }): AuditEntry[];
  clear(): void;
  get size(): number;
}
```

### Redaction (avant stockage)

- Chemins Windows : `C:\Users\xxx\...` → `C:\Users\***\...`
- Tokens : patterns `key|token|secret|password|api_key` suivis de `= "..."` → `***`
- Script tronqué à 500 chars

### Tool get_exec_log (execLogTools.ts)

```typescript
server.tool(TOOL_NAMES.GET_EXEC_LOG,
  "Get the execution audit log",
  { limit: z.number().int().min(1).max(100).optional(),
    outcome: z.enum(["executed","blocked","previewed","error"]).optional() },
  async (params) => {
    const entries = auditLog.getEntries(params);
    return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
  }
);
```

Tool offline (pas de withLiveGuard).

---

## Ordre d'implémentation

1. **Types + audit log** (`security/types.ts`, `security/auditLog.ts`, tests) — fondation
2. **Script analyzer** (`security/scriptAnalyzer.ts`, tests) — coeur de la logique
3. **Wire into handler** (tdTools.ts schema + handler, register.ts) — intégration #73 + #74
4. **get_exec_log tool** (constants, execLogTools.ts, metadata) — #75 finition
5. **Build + lint + test**

## Vérification

1. `npm run build` — compile
2. `npm test` — tous les tests passent (existants + nouveaux)
3. `npm run lint` — clean
4. Test manuel :
   - `execute_python_script("op('/').name", mode="read-only")` → exécute
   - `execute_python_script("op('/').create(baseCOMP)", mode="read-only")` → erreur blocked
   - `execute_python_script("os.system('ls')", mode="safe-write")` → erreur blocked
   - `execute_python_script("...", preview=true)` → analyse sans exécution
   - `get_exec_log(limit=5)` → dernières entrées
