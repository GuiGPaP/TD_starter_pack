<!-- session_id: c74adf2e-d51b-4b0b-8a88-347cc140cbe9 -->
# Plan: `screenshot_operator` MCP Tool

## Context

On veut permettre à Claude Code de **voir** le rendu visuel d'un opérateur TouchDesigner directement dans la conversation. Actuellement, le MCP server n'a aucun outil dédié pour ça — le seul code existant qui capture des images est dans `package_project` (sauvegarde un PNG sur disque pour le catalogue).

L'approche : un nouvel outil MCP qui exécute un script Python dans TD pour capturer l'output d'un opérateur en base64, et le retourne comme `ImageContent` MCP (inline dans la réponse, visible par Claude).

## Approche

**Pas de nouveau endpoint REST** — on réutilise `execute_python_script` (mode `read-only`) avec un script Python dynamique qui :
1. Résout l'opérateur via `op(path)`
2. Utilise `TOP.saveByteArray('.png')` pour les TOPs → bytes → base64
3. Pour les non-TOPs, retourne une erreur claire (seuls les TOPs ont un output pixel)
4. Retourne le base64 dans le JSON result

Côté TypeScript, on retourne un `{ type: "image", data, mimeType }` content block MCP.

## Fichiers à modifier

### 1. `_mcp_server/src/core/constants.ts`
Ajouter `SCREENSHOT_OPERATOR: "screenshot_operator"` dans `TOOL_NAMES`.

### 2. `_mcp_server/src/features/tools/handlers/screenshotTools.ts` (nouveau)
Nouveau handler (~100 lignes) :
- Schema Zod : `path` (string, requis), `format` (enum `png`|`jpg`, défaut `png`)
- Construit un script Python dynamique :
  ```python
  import base64
  target = op('${path}')
  if target is None:
      result = {"error": "Operator not found: ${path}"}
  elif not hasattr(target, 'saveByteArray'):
      result = {"error": f"Operator {target.path} ({target.family}) has no visual output — only TOPs can be screenshotted"}
  else:
      try:
          raw = target.saveByteArray('.${format}')
          b64 = base64.b64encode(raw).decode('ascii')
          result = {"base64": b64, "width": target.width, "height": target.height, "format": "${format}", "path": target.path}
      except Exception as e:
          result = {"error": f"Screenshot failed: {e}"}
  ```
- Appelle `tdClient.execPythonScript({ script, mode: "read-only" })`
- Si `result.base64` → retourne un content array avec :
  - `{ type: "image", data: result.base64, mimeType: "image/png" }` (ou jpg)
  - `{ type: "text", text: "Screenshot of ${path} (${width}x${height})" }` pour le contexte
- Si `result.error` → retourne texte d'erreur
- Wrappé dans `withLiveGuard` (nécessite TD connecté)

### 3. `_mcp_server/src/features/tools/register.ts`
Ajouter import + appel `registerScreenshotTools(server, logger, tdClient, serverMode)`.

### 4. `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts`
Ajouter l'entrée metadata pour `screenshot_operator`.

## Gestion d'erreurs

| Cas | Comportement |
|-----|-------------|
| TD non connecté | `withLiveGuard` retourne erreur standard |
| Opérateur inexistant | `"Operator not found: /path"` |
| Pas un TOP | `"Operator /path (CHOP) has no visual output — only TOPs can be screenshotted"` |
| TOP sans output (0×0) | `saveByteArray` lèvera une exception → capturée |
| Script Python échoue | `handleToolError` standard |

## Vérification

1. `cd _mcp_server && npm run build` — compilation TS sans erreur
2. `cd _mcp_server && npm test` — tests existants passent toujours
3. Test live (TD + MCP connectés) :
   - Appeler `screenshot_operator` avec un TOP valide → image base64 reçue
   - Appeler avec un chemin invalide → erreur propre
   - Appeler avec un CHOP → erreur "only TOPs"
