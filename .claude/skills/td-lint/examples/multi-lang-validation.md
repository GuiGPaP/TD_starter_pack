# Multi-Language Validation

## JSON/YAML DATs

Validate data DATs containing JSON or YAML:
```
validate_json_dat({ nodePath: '/project1/config1' })
```

Auto-detects format. Returns `valid`, `format` (json/yaml/unknown), and `diagnostics` with line/column on parse errors.

## GLSL Shader DATs

Validate GLSL shader code:
```
validate_glsl_dat({ nodePath: '/project1/shader_pixel' })
```

Shader type is auto-detected from DAT name suffix (`_pixel`, `_vertex`, `_compute`). Validation uses the connected GLSL TOP/MAT errors, or `glslangValidator` as fallback. Returns `valid`, `shaderType`, `validationMethod`, and `diagnostics`.

## Important

GLSL and JSON/YAML DATs should **NOT** be linted with `lint_dat` (ruff) — use the appropriate validation tool. Ruff is a Python linter and will produce garbage diagnostics on non-Python content.
