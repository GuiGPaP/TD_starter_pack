# The Correction Loop Pattern

A step-by-step walkthrough of the safe lint-and-fix cycle for a Python DAT in a live TouchDesigner session.

## Step 1: Discover Python DATs

Find all Python DATs under the target scope:

```
discover_dat_candidates({ parentPath: '/project1', purpose: 'python', recursive: true })
```

Expected response:

```json
{
  "parentPath": "/project1",
  "purpose": "python",
  "count": 2,
  "candidates": [
    {
      "path": "/project1/script1",
      "name": "script1",
      "opType": "scriptDAT",
      "kindGuess": "python",
      "confidence": "high",
      "why": "scriptDAT operator",
      "lineCount": 28,
      "parentComp": "/project1",
      "isDocked": false
    },
    {
      "path": "/project1/container1/callbacks",
      "name": "callbacks",
      "opType": "textDAT",
      "kindGuess": "python",
      "confidence": "medium",
      "why": "Python markers (3 found)",
      "lineCount": 12,
      "parentComp": "/project1/container1",
      "isDocked": true
    }
  ]
}
```

**Decision point:** Only proceed with candidates where `kindGuess == "python"`. For `"medium"` confidence, read the text first to confirm.

## Step 2: Save Original Text (Rollback Insurance)

Before touching anything, save the original source:

```
get_dat_text({ nodePath: '/project1/script1' })
```

Response:

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "text": "import os\nimport json\n\ndef onCook(dat):\n    x = op('null1')\n    data = json.loads(x.text)\n    print(data)\n"
}
```

**Store this text in memory** — you will need it if the fix breaks runtime.

## Step 3: Lint (Check Only)

Run read-only lint to see all diagnostics:

```
lint_dat({ nodePath: '/project1/script1' })
```

Response:

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "diagnosticCount": 3,
  "diagnostics": [
    {
      "code": "F401",
      "message": "`os` imported but unused",
      "line": 1,
      "column": 1,
      "endLine": 1,
      "endColumn": 10,
      "fixable": true
    },
    {
      "code": "F821",
      "message": "Undefined name `op`",
      "line": 5,
      "column": 9,
      "endLine": 5,
      "endColumn": 11,
      "fixable": false
    },
    {
      "code": "T201",
      "message": "`print` found",
      "line": 7,
      "column": 5,
      "endLine": 7,
      "endColumn": 10,
      "fixable": false
    }
  ]
}
```

**Triage the diagnostics:**
- `F401` (unused `os`) — genuinely unused, safe to auto-fix
- `F821` (`op` undefined) — TD false positive, ignore
- `T201` (`print`) — in a DAT, print goes to textport. Ask the user if this is intentional logging.

## Step 4: Dry-Run (Preview the Fix)

Preview what ruff would change:

```
lint_dat({ nodePath: '/project1/script1', fix: true, dryRun: true })
```

Response:

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "diagnosticCount": 3,
  "diagnostics": [ ... ],
  "fixed": true,
  "applied": false,
  "diff": "--- /project1/script1 (original)\n+++ /project1/script1 (fixed)\n@@ -1,4 +1,3 @@\n-import os\n import json\n \n def onCook(dat):\n",
  "fixedText": "import json\n\ndef onCook(dat):\n    x = op('null1')\n    data = json.loads(x.text)\n    print(data)\n",
  "remainingDiagnostics": [
    {
      "code": "F821",
      "message": "Undefined name `op`",
      "line": 4,
      "column": 9,
      "endLine": 4,
      "endColumn": 11,
      "fixable": false
    },
    {
      "code": "T201",
      "message": "`print` found",
      "line": 6,
      "column": 5,
      "endLine": 6,
      "endColumn": 10,
      "fixable": false
    }
  ],
  "remainingDiagnosticCount": 2
}
```

**Check the diff:** Only `import os` was removed. The remaining 2 diagnostics are expected (TD false positive + intentional print). Present the diff to the user and get confirmation.

## Step 5: Apply the Fix

After user confirmation:

```
lint_dat({ nodePath: '/project1/script1', fix: true })
```

Response:

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "diagnosticCount": 3,
  "diagnostics": [ ... ],
  "fixed": true,
  "applied": true,
  "fixedText": "import json\n\ndef onCook(dat):\n    x = op('null1')\n    data = json.loads(x.text)\n    print(data)\n",
  "remainingDiagnostics": [ ... ],
  "remainingDiagnosticCount": 2
}
```

`applied: true` — the DAT's `.text` has been updated in the live TD session.

## Step 6: Verify Runtime

Check that the fix didn't break anything:

```
get_node_errors({ nodePath: '/project1/script1' })
```

**Healthy response:**

```json
{
  "nodePath": "/project1/script1",
  "nodeName": "script1",
  "opType": "scriptDAT",
  "errorCount": 0,
  "hasErrors": false,
  "errors": []
}
```

No errors — the correction loop is complete.

## Rollback Scenario

If `get_node_errors` returns `hasErrors: true` after the fix:

```
set_dat_text({
  nodePath: '/project1/script1',
  text: 'import os\nimport json\n\ndef onCook(dat):\n    x = op(\'null1\')\n    data = json.loads(x.text)\n    print(data)\n'
})
```

This restores the original text saved in Step 2. Then report the failure:

> "Fix rolled back — ruff removed `import os` but this introduced a runtime error. The original code has been restored. The remaining diagnostics (F821 for `op`, T201 for `print`) are TD false positives and intentional logging respectively."
