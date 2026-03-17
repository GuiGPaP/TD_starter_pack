# TD_Docker — TouchDesigner MCP Project

## Skill Decision Tree

When working with TouchDesigner, pick the right skill:

| Need | Skill |
|------|-------|
| TD network / operators / layout / components / data conversion / rendering | **td-guide** |
| Pixel shader / GLSL TOP / 2D image effect / generative texture / feedback | **td-glsl** |
| Vertex shader / GLSL MAT / 3D material / displacement / instancing | **td-glsl-vertex** |
| Compute shader / particles / GLSL POP / SSBO / point cloud | **td-pops** |

**When in doubt:** Start with `td-guide` — it routes to the GLSL skills when needed.

## Global Rule

**Pre-trained TD knowledge is unreliable** — always read skill reference files before writing TouchDesigner code. Do not guess parameter names, operator types, or API patterns from memory.

## Project Structure

```
modules/                          # TouchDesigner Python modules
  mcp/
    services/
      api_service.py              # MCP API service — TD ↔ Claude bridge
import_modules.py                 # Module loader
mcp_webserver_base.tox            # MCP web server TOX component

.claude/
  skills/
    td-guide/                     # Network creation, operators, rendering
    td-glsl/                      # GLSL TOP pixel shaders
    td-glsl-vertex/               # GLSL MAT vertex shaders
    td-pops/                      # GLSL POP compute shaders
  skills-archive/
    touchdesigner-glsl-legacy/    # Archived previous monolithic GLSL skill
```

## Attribution

Skills adapted from open-source repositories (both MIT licensed):
- **td-guide** — adapted from [satoruhiga/claude-touchdesigner](https://github.com/satoruhiga/claude-touchdesigner)
- **td-glsl, td-glsl-vertex, td-pops** — adapted from [rheadsh/audiovisual-production-skills](https://github.com/rheadsh/audiovisual-production-skills)

## Tooling

Python tooling (ruff, pyright, pytest, just, uv) is planned for a future iteration.
