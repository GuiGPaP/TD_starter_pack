<!-- session_id: 3451119f-8149-49e1-9ab0-c32018704301 -->
# Security Audit & Remediation — TD_starter_pack

## Context

Audit de sécurité du serveur MCP TouchDesigner. Outil de dev local (stdio + HTTP `127.0.0.1`).
Menace principale : bypass HTTP direct vers le WebServer TD (port 9981) contournant le garde-fou TS.
Le flux complet : MCP client → TS server (scriptAnalyzer) → HTTP → Python (api_service.py exec).

**Constat clé :** l'enforcement n'existe que côté TS. L'OpenAPI spec (`exec.yml`) n'a que `script`, pas de `mode`. Un appel HTTP direct au WebServer exécute n'importe quoi sans vérification.

---

## Findings révisés

| ID | Sévérité | Description | Exploitabilité |
|----|----------|-------------|----------------|
| C1 | CRITICAL | Python exec sans enforcement de mode — bypass HTTP direct | HIGH |
| C2 | CRITICAL | Default mode `full-exec` (tdTools.ts:432) — breaking change à planifier | HIGH |
| C3 | HIGH | `globals()` leak (api_service.py:579/565) — expose os, subprocess, etc. Mais fix insuffisant si juste `__builtins__` (expose encore __import__, eval, exec, open) | HIGH |
| H1 | HIGH | glslangValidator download sans SHA256 (api_service.py:1399) | MEDIUM |
| H2 | HIGH | `importlib` seulement en low-confidence, pas bloqué (scriptAnalyzer.ts:184) | HIGH |
| M1 | LOW | Docker 0.0.0.0 — déjà mitigé par docker-compose loopback + docs | LOW |
| M2 | MEDIUM | Dockerfiles sans USER directive | LOW |
| M3 | LOW | `__import__()` sans allowlist (mcp_webserver_script.py:60) — usages hardcodés | VERY LOW |

**Code duplication critique :** chaque fix Python doit être appliqué aux DEUX copies :
- `modules/mcp/services/api_service.py` (parent)
- `_mcp_server/td/modules/mcp/services/api_service.py` (submodule)
- Idem pour `modules/mcp_webserver_script.py` et sa copie sous `_mcp_server/td/`

---

## Plan d'implémentation

### Phase 1 — P0 : Enforcement Python + default mode (CRITICAL)

#### 1.1 Ajouter `mode` à l'OpenAPI spec + codegen

**Fichiers :**
- `_mcp_server/src/api/paths/api/td/server/exec.yml` — ajouter propriété `mode` (enum: read-only, safe-write, full-exec, default: safe-write)
- Regénérer le client Zod : `_mcp_server/src/gen/mcp/touchDesignerAPI.zod.ts`
- Regénérer les handlers Python : `modules/mcp/controllers/generated_handlers.py`

#### 1.2 Implémenter enforcement côté Python

**Fichier :** `modules/mcp/services/api_service.py` (+ copie submodule)

Ajouter à `exec_python_script()` :
1. Accepter paramètre `mode: str = "safe-write"`
2. Avant eval/exec, scanner le script avec des patterns Python miroir de ceux du TS :
   - **safe-write bloqué :** `.destroy()`, `os.remove`, `os.unlink`, `os.rmdir`, `shutil.rmtree`, `subprocess`, `os.system`, `eval()`, `exec()`, `compile()`, `__import__()`, `socket`, `urllib`, `requests.`, `sys.exit`, `import os/subprocess/shutil/pathlib/tempfile`
   - **read-only bloqué :** tout safe-write + `.par.` assignment, `.create()`, `.copy()`, `.connect()`, `.text =`, `.insertRow()`, `.appendRow()`, `.deleteRow()`
   - **full-exec :** tout autorisé
3. Couvrir aussi les ops TD destructrices (`.destroy()`) — pas seulement os/subprocess
4. Retourner erreur explicite si mode insuffisant, avec le mode requis

#### 1.3 Changer default mode à `safe-write`

**Fichier :** `_mcp_server/src/features/tools/handlers/tdTools.ts:432`
```typescript
const mode: ExecMode = rawMode ?? "safe-write";  // was "full-exec"
```

**Breaking change — à accompagner de :**
- Mise à jour de la description du tool (ligne 92)
- Tests unitaires adaptés
- Release note dans CHANGELOG.md

### Phase 2 — P1 : Hardening namespace + patterns + supply chain

#### 2.1 Namespace restrictif avec allowlist de builtins

**Fichier :** `modules/mcp/services/api_service.py:579` (+ copie submodule)

Remplacer `dict(globals())` par un namespace construit explicitement :

```python
_SAFE_BUILTINS = {
    name: getattr(__builtins__, name) if hasattr(__builtins__, name) else getattr(builtins, name)
    for name in [
        "True", "False", "None", "abs", "all", "any", "bin", "bool",
        "bytes", "chr", "dict", "dir", "divmod", "enumerate", "filter",
        "float", "format", "frozenset", "getattr", "hasattr", "hash",
        "hex", "id", "int", "isinstance", "issubclass", "iter", "len",
        "list", "map", "max", "min", "next", "oct", "ord", "pow",
        "print", "range", "repr", "reversed", "round", "set", "slice",
        "sorted", "str", "sum", "tuple", "type", "vars", "zip",
    ]
}
```

- En mode `read-only`/`safe-write` : namespace = `{"__builtins__": _SAFE_BUILTINS}` + `local_vars`
- En mode `full-exec` : namespace = `{"__builtins__": __builtins__}` + `local_vars` (restaure `__import__`, `open`, `eval`, `exec`)
- **Ne jamais inclure `dict(globals())`** quel que soit le mode

#### 2.2 Ajouter `importlib` + `getattr(__builtins__` aux FULL_EXEC_PATTERNS

**Fichier :** `_mcp_server/src/features/tools/security/scriptAnalyzer.ts`

Ajouter à `FULL_EXEC_PATTERNS` (après ligne 171) :
```typescript
{
    category: "exec",
    description: "importlib usage requires full-exec mode",
    minMode: "full-exec",
    pattern: /\bimportlib\b/,
},
{
    category: "exec",
    description: "getattr on __builtins__ requires full-exec mode",
    minMode: "full-exec",
    pattern: /getattr\s*\(\s*__builtins__/,
},
```

#### 2.3 glslangValidator SHA256 verification

**Fichier :** `modules/mcp/services/api_service.py` (+ copie submodule)

1. Pinner `_GLSLANG_RELEASE_TAG` sur un tag stable (pas `main-tot`)
2. Ajouter dict `_GLSLANG_SHA256` par (platform, machine) → hash attendu du zip
3. Dans `_download_glslang_validator()` : calculer `hashlib.sha256` du zip téléchargé, comparer avant extraction
4. Enregistrer `sha256` dans `glslang.json` metadata

#### 2.4 USER non-root dans Dockerfiles

**Fichiers :**
- `_mcp_server/Dockerfile` : ajouter `RUN addgroup --system app && adduser --system --ingroup app app` + `USER app`
- `modules/td_server/Dockerfile` : ajouter `RUN adduser -D -S app -G nogroup` + `USER app`

### Phase 3 — P2 : Cleanup + hardening secondaire

#### 3.1 Allowlist pour `__import__()` dans mcp_webserver_script.py

**Fichier :** `modules/mcp_webserver_script.py:60` (+ copie submodule)

```python
_ALLOWED_MODULES = {
    "mcp.controllers.api_controller",
    "mcp.services.api_service",
    # ... modules internes existants
}
if module_name not in _ALLOWED_MODULES:
    raise ImportError(f"Module {module_name!r} not in allowlist")
```

#### 3.2 Enrichir audit log redaction

**Fichier :** `_mcp_server/src/features/tools/security/auditLog.ts:11-18`

Ajouter patterns : `Bearer `, `Basic `, URLs avec credentials (`://user:pass@`)

---

## Fichiers critiques (ordre de modification)

| # | Fichier | Raison |
|---|---------|--------|
| 1 | `_mcp_server/src/api/paths/api/td/server/exec.yml` | Ajouter `mode` à l'API |
| 2 | Codegen (orval/zod + Python handlers) | Propager `mode` |
| 3 | `modules/mcp/services/api_service.py` | Enforcement Python + namespace + SHA256 |
| 4 | `_mcp_server/td/modules/mcp/services/api_service.py` | Copie identique |
| 5 | `_mcp_server/src/features/tools/handlers/tdTools.ts` | Default safe-write |
| 6 | `_mcp_server/src/features/tools/security/scriptAnalyzer.ts` | Patterns importlib/getattr |
| 7 | `_mcp_server/Dockerfile` + `modules/td_server/Dockerfile` | USER non-root |
| 8 | `modules/mcp_webserver_script.py` (+ copie) | Allowlist __import__ |
| 9 | `_mcp_server/src/features/tools/security/auditLog.ts` | Redaction patterns |

---

## Vérification

| Phase | Test | Commande / méthode |
|-------|------|--------------------|
| P0 | Script `os.remove('/tmp/x')` sans mode → rejeté côté Python | Appel HTTP direct au WebServer TD |
| P0 | Script `op('/project1').destroy()` en mode safe-write → rejeté | Appel via MCP tool |
| P0 | Default mode = safe-write dans les tests TS | `npm test` dans _mcp_server |
| P1 | `import os` en mode safe-write → `os` non disponible dans namespace | Test unitaire Python |
| P1 | `importlib.import_module('os')` → requiert full-exec côté TS | Test unitaire scriptAnalyzer |
| P1 | Download glslang avec SHA256 erroné → rejeté | Test unitaire avec mock |
| P1 | `docker run --rm <image> whoami` → `app` | Build Docker |
| P2 | `__import__('random_module')` dans webserver → ImportError | Test unitaire Python |
| Global | `just check` + `just test` (parent) | CI |
| Global | `npm run lint && npm test` (_mcp_server) | CI submodule |

---

## Notes

- **Branche unique** dans le repo parent, submodule modifié in-place
- Les modifications touchent le contrat HTTP (OpenAPI) → régénération codegen obligatoire
- Le changement de default mode est un **breaking change** pour les clients existants qui s'attendent à full-exec par défaut
