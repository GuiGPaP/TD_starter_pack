# TouchDesigner MCP

[![Version](https://img.shields.io/npm/v/touchdesigner-mcp-server?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/touchdesigner-mcp-server)
[![Downloads](https://img.shields.io/npm/dt/touchdesigner-mcp-server.svg?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/touchdesigner-mcp-server)

This is an implementation of an MCP (Model Context Protocol) server for TouchDesigner. Its goal is to enable AI agents to control and operate TouchDesigner projects.

[English](README.md) / [日本語](README.ja.md)

## Overview

[![demo clip](https://github.com/8beeeaaat/touchdesigner-mcp/blob/main/assets/particle_on_youtube.png)](https://youtu.be/V2znaqGU7f4?si=6HDFbcBHCFPdttkM&t=635)

TouchDesigner MCP acts as a bridge between AI models and the TouchDesigner WebServer DAT, enabling AI agents to:

- Create, modify, and delete nodes
- Query node properties and project structure
- Programmatically control TouchDesigner via Python scripts

## Installation

Please refer to the **[Installation Guide](docs/installation.md)**.

If you are updating, please refer to the procedure in the **[Latest Release](https://github.com/8beeeaaat/touchdesigner-mcp/releases/latest#for-updates-from-previous-versions)**.

## MCP Server Features

This server enables AI agents to perform operations in TouchDesigner using the Model Context Protocol (MCP).

### Tools

Tools allow AI agents to perform actions in TouchDesigner.

| Tool Name                | Description                                                        |
| :---------------------- | :----------------------------------------------------------------- |
| `create_td_node`        | Creates a new node.                                                |
| `delete_td_node`        | Deletes an existing node.                                          |
| `exec_node_method`      | Calls a Python method on a node.                                   |
| `execute_python_script` | Executes an arbitrary Python script in TouchDesigner.              |
| `get_module_help`       | Gets Python help() documentation for TouchDesigner modules/classes.|
| `get_td_class_details`  | Gets details of a TouchDesigner Python class or module.            |
| `get_td_classes`        | Gets a list of TouchDesigner Python classes.                       |
| `get_td_info`           | Gets information about the TouchDesigner server environment.       |
| `get_td_node_errors`    | Checks for errors on a specified node and its children.            |
| `get_td_node_parameters`| Gets the parameters of a specific node.                            |
| `get_td_nodes`          | Gets nodes under a parent path, with optional filtering.           |
| `update_td_node_parameters` | Updates the parameters of a specific node.                     |
| `create_geometry_comp`  | Creates a Geometry COMP with In/Out operators.                     |
| `create_feedback_loop`  | Creates a feedback TOP loop (init/feedback/process/out).           |
| `configure_instancing`  | Configures GPU instancing on a Geometry COMP.                      |
| `get_dat_text`          | Reads the .text content of a DAT operator.                         |
| `set_dat_text`          | Writes .text content to a DAT operator.                            |
| `lint_dat`              | Lints DAT code with ruff, optional auto-fix and dry-run.           |
| `discover_dat_candidates` | Discovers DAT candidates under a parent, classified by kind.     |
| `get_node_parameter_schema` | Gets parameter schema (type, range, menu, default) for a node. |
| `complete_op_paths`     | Completes op() path references from a context node.                |
| `get_chop_channels`     | Gets CHOP channel names and optional statistics.                   |
| `get_dat_table_info`    | Gets table DAT dimensions and content sample.                      |
| `get_comp_extensions`   | Gets COMP extension methods and properties.                        |
| `describe_td_tools`     | Generates a filesystem-style manifest of available tools.          |
| `get_capabilities`      | Gets available capabilities and tool versions from the server.     |
| `typecheck_dat`         | Typechecks DAT code with pyright using td.pyi stubs.               |
| `format_dat`            | Auto-formats DAT code with ruff, optional dry-run.                 |
| `validate_glsl_dat`     | Validates GLSL shader code in a DAT operator.                      |
| `validate_json_dat`     | Validates JSON/YAML content in a DAT operator.                     |
| `lint_dats`             | Batch lints all Python DATs under a parent path.                   |
| `index_td_project`      | Builds a Markdown project index for code completion.               |
| `get_td_context`        | Aggregates contextual info for a single node.                      |
| `search_td_assets`      | Searches the catalogue of reusable TD assets (offline).            |
| `get_td_asset`          | Gets detailed info about a specific TD asset by ID (offline).      |
| `deploy_td_asset`       | Deploys a reusable .tox asset into the running TD project.         |
| `search_operators`      | Searches the local operator catalogue once generated.              |
| `refresh_operator_catalog` | Generates a factual local operator catalogue from a running TouchDesigner instance. |
| `index_td_offline_help` | Indexes the user's local TouchDesigner Offline Help into the local operator cache. |

### Operator Catalogue

The npm package does not bundle Derivative operator documentation or the old
`data/td-knowledge/operators/*.json` corpus. Operator knowledge is generated
locally on the user's machine:

- `refresh_operator_catalog` connects to TouchDesigner and records factual
  runtime metadata such as operator type, family, parameter names, styles,
  defaults, ranges, and menu values.
- `index_td_offline_help` reads the user's local TouchDesigner Offline Help
  folder, when available, and stores extracted summaries/descriptions in the
  user's local cache.

The local cache is stored outside the repository by default. Set
`TD_MCP_OPERATOR_CACHE_DIR` to override the cache directory, or
`TD_MCP_OFFLINE_HELP_PATH` to point directly at an Offline Help folder.

### Prompts

Prompts provide instructions for AI agents to perform specific actions in TouchDesigner.

| Prompt Name         | Description                                                                 |
| :------------------| :-------------------------------------------------------------------------- |
| `Search node`      | Fuzzy searches for nodes and retrieves information based on name, family, or type. |
| `Node connection`  | Provides instructions to connect nodes within TouchDesigner.                |
| `Check node errors`| Checks for errors on a specified node, and recursively for its children.    |

### Resources

Not implemented.

## Developer Guide

Looking for local setup, client configuration, project structure, or release workflow notes?
See the **[Developer Guide](docs/development.md)** for all developer-facing documentation.

## Troubleshooting

### Troubleshooting version compatibility

The MCP server uses **semantic versioning** for flexible compatibility checks

| MCP Server | API Server | Minimum compatible API version | Behavior | Status | Notes |
|------------|------------|----------------|----------|--------|-------|
| 1.3.x | 1.3.0 | 1.3.0 | ✅ Works normally | Compatible | Recommended baseline configuration |
| 1.3.x | 1.4.0 | 1.3.0 | ⚠️ Warning shown, continues | Warning | Older MCP MINOR with newer API may lack new features |
| 1.4.0 | 1.3.x | 1.3.0 | ⚠️ Warning shown, continues | Warning | Newer MCP MINOR may have additional features |
| 1.3.2 | 1.3.1 | 1.3.2 | ❌ Execution stops | Error | API below minimum compatible version |
| 2.0.0 | 1.x.x | N/A | ❌ Execution stops | Error | Different MAJOR = breaking changes |

**Compatibility Rules**:

- ✅ **Compatible**: Same MAJOR version AND API version ≥ 1.3.0 (minimum compatible version)
- ⚠️ **Warning**: Different MINOR or PATCH versions within the same MAJOR version (shows warning but continues execution)
- ❌ **Error**: Different MAJOR versions OR API server < 1.3.0 (execution stops immediately, update required)

- **To resolve compatibility errors:**
  1. Download the latest [touchdesigner-mcp-td.zip](https://github.com/8beeeaaat/touchdesigner-mcp/releases/latest/download/touchdesigner-mcp-td.zip) from the releases page.
  2. Delete the existing `touchdesigner-mcp-td` folder and replace it with the newly extracted contents.
  3. Remove the old `mcp_webserver_base` component from your TouchDesigner project and import the `.tox` from the new folder.
  4. Restart TouchDesigner and the AI agent running the MCP server (e.g., Claude Desktop).

- **For developers:** When developing locally, run `npm run version` after editing `package.json` (or simply use `npm version ...`). This keeps the Python API (`pyproject.toml` + `td/modules/utils/version.py`), MCP bundle manifest, and registry metadata in sync so that the runtime compatibility check succeeds.

For a deeper look at how the MCP server enforces these rules, see [Version Compatibility Verification](docs/architecture.md#version-compatibility-verification).

### Troubleshooting connection errors

- `TouchDesignerClient` caches failed connection checks for **60 seconds**. Subsequent tool calls reuse the cached error to avoid spamming TouchDesigner and automatically retry after the TTL expires.
- When the MCP server cannot reach TouchDesigner, you now get guided error messages with concrete fixes:
  - `ECONNREFUSED` / "connect refused": start TouchDesigner, ensure the WebServer DAT from `mcp_webserver_base.tox` is running, and confirm the configured port (default `9981`).
  - `ETIMEDOUT` / "timeout": TouchDesigner is responding slowly or the network is blocked. Restart TouchDesigner/WebServer DAT or check your network connection.
  - `ENOTFOUND` / `getaddrinfo`: the host name is invalid. Use `127.0.0.1` unless you explicitly changed it.
- The structured error text is also logged through `ILogger`, so you can check the MCP logs to understand why a request stopped before hitting TouchDesigner.
- Once the underlying issue is fixed, simply run the tool again—the client clears the cached error and re-verifies the connection automatically.

## Contributing

We welcome your contributions!

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Make your changes.
4. Add tests and ensure everything works (`npm test`).
5. Commit your changes (`git commit -m 'Add some amazing feature'`).
6. Push to your branch (`git push origin feature/amazing-feature`).
7. Open a pull request.

Please always include appropriate tests when making implementation changes.

## License

MIT
