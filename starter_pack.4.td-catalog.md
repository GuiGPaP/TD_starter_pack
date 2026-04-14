# starter_pack.4

## Purpose

TouchDesigner project centered on a webserver/API bridge network via mcp_webserver_base.

## Network Shape

- Operators scanned: 5
- Connections discovered: 0
- Families: 1 COMP, 4 DAT
- Top operator types: 2 textDAT, 1 baseCOMP, 1 parameterDAT, 1 webserverDAT

## Top-Level Structure

- `mcp_webserver_base`

## Notable Patterns

- Appears to expose a webserver or MCP-facing control network.

## Key Operators

- `/project1/mcp_webserver_base` (baseCOMP) - externaltox=C:/Users/guill/Desktop/TD_starter_pack/mcp_webserver_base.tox, Port=9981
- `/project1/mcp_webserver_base/parameter1` (parameterDAT) - ops=/project1/mcp_webserver_base
- `/project1/mcp_webserver_base/mpc_webserver` (webserverDAT) - active=True, restart=False, port=9981, callbacks=/project1/mcp_webserver_base/mcp_webserver_script, minprotocol=tls10

## Packaging Notes

- No suitable TOP found for thumbnail

See `starter_pack.4.td-catalog.json` for the machine-readable graph export (nodes, non-default parameters, and connections).