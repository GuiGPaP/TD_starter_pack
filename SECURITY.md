# Security Policy

## Python script execution modes

The MCP server can execute Python code inside TouchDesigner via `execute_python_script` and `exec_node_method`. Because this is a privileged capability, execution is gated by an explicit mode setting:

| Mode | Behavior | When to use |
|---|---|---|
| `off` (**default**) | All script execution blocked — only read-only inspection tools work | Untrusted projects, shared sessions, production |
| `allowlist` | Scripts allowed only if they match a curated safe builtins list (read-only inspection, parameter reads) | Controlled environments where you trust the prompts but not arbitrary code |
| `on` | Full Python execution, including file I/O, subprocess, and network | Local dev on your own projects only |

**Defaults are safe**: out of the box the server refuses to execute scripts. Opt-in is explicit via env var or config.

The allowlist enforcement lives in the Python-side of the MCP (`modules/mcp/services/api_service.py`) — it is the primary gate. The TypeScript MCP server mirrors the mode parameter but is not the security boundary.

### What to avoid

- Running in `on` mode with untrusted prompts, shared sessions, or public MCP endpoints.
- Exposing the TD web server port (`9981`) beyond `localhost` — there is no auth layer.
- Committing `.mcp.json` with a non-default mode into a public repo.

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
- **Intentional local execution** — `execute_python_script` with `mode=on` is designed to run arbitrary code; that is the feature, not a bug.
- **Third-party submodules** — `TDpretext` and `TDDocker` have their own repos and policies.

## Supported versions

Only the `main` branch is actively maintained. There are no LTS releases at this stage.
