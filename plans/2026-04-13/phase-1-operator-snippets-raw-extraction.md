<!-- session_id: 76d41657-6bc5-4dda-8fb4-06d103e016ae -->
# Phase 1 — Operator Snippets Raw Extraction

## Context

Issue #105: Extract knowledge from TD's 483 official Operator Snippets (`.tox` files in `app.installFolder/Samples/Learn/OPSnippets/Snippets/`). The snippets contain best practices, readMe explanations, network topologies, and code — a goldmine for our MCP knowledge base.

Phase 1 focuses on **raw extraction only**: a Python script running in TD via `execute_python_script` (full-exec) that loads each .tox, introspects it, and dumps structured JSON to disk.

## Architecture

### Script Strategy: Per-family execution (7 runs)

Running all 483 snippets in one script risks timeouts and memory issues. Instead:
- One `execute_python_script` call per family (CHOP, COMP, DAT, MAT, POP, SOP, TOP)
- Each call writes its results to `{project_dir}/snippets_data/{family}.json`
- A final summary call aggregates stats across all families

### Output Location

`snippets_data/` at project root (not inside `_mcp_server/` — this is raw intermediate data, not yet knowledge entries). Will be `.gitignore`d since it's large generated data.

### JSON Schema (per snippet)

```json
{
  "id": "noise-top",
  "filename": "noiseTOP.tox",
  "family": "TOP",
  "opType": "noiseTOP",
  "readMe": "text content from readMe DAT or null",
  "operators": [
    {
      "name": "noise1",
      "opType": "noiseTOP",
      "family": "TOP",
      "x": 0, "y": 0,
      "nonDefaultParams": {
        "resolutionw": 512,
        "resolutionh": 512,
        "type": "random"
      }
    }
  ],
  "connections": [
    { "from": "noise1", "fromOutput": 0, "to": "out1", "toInput": 0 }
  ],
  "datContents": [
    { "name": "script1", "type": "textDAT", "language": "python", "text": "..." }
  ],
  "exports": [],
  "extractionMeta": {
    "tdBuild": "099.2025.32460",
    "extractedAt": "2026-04-13T...",
    "opCount": 5,
    "connectionCount": 3,
    "hasReadMe": true,
    "warnings": []
  }
}
```

Family-level output:
```json
{
  "family": "TOP",
  "tdBuild": "099.2025.32460",
  "extractedAt": "...",
  "snippetCount": 93,
  "successCount": 90,
  "failCount": 3,
  "snippets": [ ... ],
  "errors": [ { "filename": "...", "error": "..." } ]
}
```

## Implementation Steps

### Step 1 — Create extraction script template

Write a Python script that:
1. Resolves the snippets directory via `app.installFolder`
2. Creates a temp container COMP at `/snippets_extract_temp`
3. For a given family, iterates `.tox` files alphabetically
4. Per .tox: `container.loadTox(path)` → introspect → collect data → destroy children
5. Extracts: readMe text, operator list with non-default params, connections, DAT text content
6. Writes JSON to `project.folder + '/snippets_data/{family}.json'`
7. Returns summary stats (count, errors, timing)

Key introspection functions:
- `op.findChildren(depth=1)` for top-level ops in the snippet
- `p.isDefault` to filter non-default params
- `op.inputConnectors` / `op.outputConnectors` for connections  
- `op.text` for DAT text content
- Check `op.OPType` and `op.family` for classification

### Step 2 — Execute per family (7 calls)

Run the script 7 times, once per family. Order: MAT (7, smallest) → COMP (28) → DAT (51) → SOP (90) → TOP (93) → POP (102) → CHOP (112).

Start with MAT as a smoke test (only 7 snippets), verify output, then run the rest.

### Step 3 — Aggregate and verify

- Run a summary script that reads all 7 JSON files and reports:
  - Total snippets extracted vs expected (483)
  - Success rate (target: ≥95%)
  - Snippets with readMe vs without
  - Average ops per snippet
  - Top non-default params across all snippets
- Spot-check 2-3 snippets manually via `get_td_nodes` to compare

### Step 4 — Add to .gitignore

Add `snippets_data/` to `.gitignore` (raw data, not for version control).

## Critical Files

- `_mcp_server/src/features/resources/types.ts` — knowledge entry schemas (for future Phase 2 alignment)
- `_mcp_server/data/td-knowledge/` — where processed entries will eventually live (Phase 2+)
- `.gitignore` — add `snippets_data/`

## Verification

1. MAT family smoke test: 7 snippets extracted, valid JSON, readMe present where expected
2. All 7 families extracted: ≥95% success rate (≥459/483)
3. Spot-check 3 snippets: compare extracted data with manual `get_td_nodes` inspection
4. JSON is valid and parseable: `json.loads()` on each family file
5. No TD side effects: `/snippets_extract_temp` container destroyed after each family

## Risks & Mitigations

- **Script timeout**: Per-family execution limits blast radius. If a family times out, can split into batches.
- **Corrupted .tox**: Try/except per snippet, log error, continue. Target ≥95% success.
- **Memory leaks**: Destroy container children after each snippet. Monitor via `get_performance` if needed.
- **Large response**: Script writes to disk, only returns summary stats via MCP response.
