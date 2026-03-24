<!-- session_id: c3cba092-b4ad-467c-91f6-f19055c51c4f -->
# Issue #100 — Align nodes when they are created

## Context

`create_td_node` crée les nodes à la position par défaut de TD (0,0), ce qui les empile les uns sur les autres. `create_geometry_comp` et `create_feedback_loop` ont déjà des params `x`/`y`. Le layout helper `modules/td_helpers/layout.py` a des utilitaires (`chain_ops`, `place_below`, `get_bounds`).

## Approche

Ajouter `x` et `y` optionnels à `create_td_node`. Quand non fournis, auto-positionner le nouveau node à droite du dernier node du parent (200px de spacing, comme `chain_ops`).

## Changements

### 1. Python : `api_service.py` — ajouter x, y et auto-layout

```python
def create_node(self, parent_path, node_type, node_name=None, parameters=None, x=None, y=None):
    parent_node = td.op(parent_path)
    new_node = parent_node.create(node_type, node_name)

    if x is not None and y is not None:
        new_node.nodeX = x
        new_node.nodeY = y
    else:
        # Auto-position: find rightmost sibling, place 200px to its right
        siblings = [c for c in parent_node.children if c != new_node]
        if siblings:
            max_x = max(c.nodeX for c in siblings)
            new_node.nodeX = max_x + 200
            new_node.nodeY = siblings[0].nodeY  # align with first sibling
```

Le generated_handler passe déjà les kwargs via `inspect.signature()` — pas besoin de toucher le code généré.

### 2. TypeScript : `tdTools.ts` — étendre le schema

```typescript
const createNodeToolSchema = CreateNodeBody.extend({
    ...detailOnlyFormattingSchema.shape,
    x: z.number().optional().describe("Node X position (auto-positioned if omitted)"),
    y: z.number().optional().describe("Node Y position (auto-positioned if omitted)"),
});
```

Les params `x`/`y` sont extraits avec `createParams` (pas les formatting options) et envoyés au body API.

### 3. Pas de changement OpenAPI

Les extra fields passent à travers le generated_handler via `kwargs.update(parsed_body)` + `inspect.signature()`. Pas besoin de régénérer.

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `modules/mcp/services/api_service.py` | +x, y params + auto-layout |
| `_mcp_server/src/features/tools/handlers/tdTools.ts` | +x, y dans schema create_td_node |

## Vérification

1. `create_td_node(parentPath="/project1", nodeType="noiseTOP")` → node auto-positionné à droite
2. `create_td_node(..., x=500, y=200)` → node à la position demandée
3. Créer 3 nodes sans x/y → chacun décalé de 200px
4. Tests Python existants toujours verts
