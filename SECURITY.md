# Security Policy

## Python script execution modes

The MCP server can execute Python code inside TouchDesigner via `execute_python_script` and call node methods via `exec_node_method`. These are privileged local capabilities and must only be exposed to clients you trust.

`execute_python_script` accepts an explicit `mode` parameter:

| Mode | Behavior | When to use |
|---|---|---|
| `read-only` | Allows introspection and reads; blocks parameter writes, node creation, connections, DAT text writes, and higher-risk patterns | Inspecting untrusted projects or previewing scripts |
| `safe-write` (**default**) | Allows normal TD graph edits such as creating nodes, changing parameters, connecting nodes, and editing DAT text; blocks destructive node operations, filesystem writes, subprocesses, network access, dynamic execution/imports, and process exits | Local creative coding workflows where graph edits are expected |
| `full-exec` | Unrestricted Python execution in the TouchDesigner process | Local development on your own trusted projects only |

`preview=true` analyzes a script without executing it and returns the required mode plus detected violations. The execution audit log is available through `get_exec_log`.

This is a usage guard rail, not an OS-level sandbox. The analyzer is pattern-based and the Python process still runs inside TouchDesigner.

### What to avoid

- Running `full-exec` with untrusted prompts, shared sessions, or public MCP endpoints.
- Exposing the TD web server port (`9981`) beyond `localhost` — there is no auth layer.
- Exposing the MCP HTTP transport beyond `localhost` unless you add your own network controls.
- Committing local secrets, generated OfflineHelp caches, extracted Operator Snippets data, or project-specific credentials.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Use one of the private channels:

1. **GitHub Security Advisory** (preferred): https://github.com/GuiGPaP/TD_starter_pack/security/advisories/new
2. **Email**: `guillaume.parrat@gmail.com` with subject `[SECURITY] TD_starter_pack: <short description>`

Please include:
- Affected component (root wrapper, `_mcp_server`, `TDpretext`, `TDDocker`)
- Version / commit hash
- Reproduction steps or proof-of-concept
- Potential impact

Expect an initial acknowledgement within 7 days. Coordinated disclosure is appreciated.

## Out of scope

- **TouchDesigner itself** — report TD vulnerabilities to [Derivative](https://derivative.ca/).
- **Intentional local execution** — `execute_python_script` with `mode=full-exec` is designed to run arbitrary code; that is the feature, not a bug.
- **Third-party submodules** — `TDpretext` and `TDDocker` have their own repos and policies.

## Supported versions

Only the `main` branch is actively maintained. There are no LTS releases at this stage.
