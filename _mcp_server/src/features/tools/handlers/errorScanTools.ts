import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import { withLiveGuard } from "../toolGuards.js";

/**
 * Python script that scans a TD network subtree for operators with errors
 * or warnings. Returns JSON-serializable dict.
 *
 * Accepts `scope` (root path), `max_depth`, and `include_warnings`.
 * Walks operators via findChildren, calls .errors() and optionally
 * .warnings() on each, caps at 500 operators.
 */
const ERROR_SCAN_SCRIPT = `
import json

scope = '__SCOPE__'
max_depth = __MAX_DEPTH__
include_warnings = __INCLUDE_WARNINGS__
MAX_OPS = 500

scan_root = op(scope)
result_data = {}

if not scan_root or not scan_root.valid:
    result_data = {"error": f"Invalid scope: {scope}"}
else:
    children = scan_root.findChildren(maxDepth=max_depth)
    truncated = len(children) > MAX_OPS
    children = children[:MAX_OPS]

    issues = []
    warnings_supported = True

    for _c in children:
        # Errors
        try:
            _errs = _c.errors()
            if _errs:
                issues.append({
                    "path": _c.path,
                    "name": _c.name,
                    "opType": _c.OPType,
                    "family": _c.family,
                    "severity": "error",
                    "message": str(_errs),
                })
        except Exception:
            pass

        # Warnings
        if include_warnings:
            try:
                _warns = _c.warnings()
                if _warns:
                    issues.append({
                        "path": _c.path,
                        "name": _c.name,
                        "opType": _c.OPType,
                        "family": _c.family,
                        "severity": "warning",
                        "message": str(_warns),
                    })
            except AttributeError:
                warnings_supported = False
                include_warnings = False
            except Exception:
                pass

    error_count = sum(1 for i in issues if i["severity"] == "error")
    warning_count = sum(1 for i in issues if i["severity"] == "warning")

    result_data = {
        "totalScanned": len(children),
        "truncated": truncated,
        "errorCount": error_count,
        "warningCount": warning_count,
        "warningsSupported": warnings_supported,
        "issues": issues,
    }

result = json.dumps(result_data)
`;

function buildErrorScanScript(
	scope: string,
	maxDepth: number,
	includeWarnings: boolean,
): string {
	return ERROR_SCAN_SCRIPT.replace("__SCOPE__", scope)
		.replace("__MAX_DEPTH__", String(maxDepth))
		.replace("__INCLUDE_WARNINGS__", includeWarnings ? "True" : "False");
}

const scanNetworkErrorsSchema = {
	includeWarnings: z
		.boolean()
		.describe("Also collect operator warnings (default: true)")
		.optional(),
	maxDepth: z
		.number()
		.int()
		.min(1)
		.max(20)
		.describe("How deep to recurse into the operator tree (default: 5)")
		.optional(),
	scope: z
		.string()
		.describe(
			"Root path to scan (e.g., '/project1', '/project1/myComp'). Default: '/project1'",
		)
		.optional(),
};

export function registerErrorScanTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
): void {
	server.tool(
		TOOL_NAMES.SCAN_NETWORK_ERRORS,
		"Scan a TouchDesigner network subtree for operators with errors or warnings. Returns a structured report of all issues found. Use to diagnose broken networks, find misconfigured operators, or verify a network is error-free.",
		scanNetworkErrorsSchema,
		withLiveGuard(
			TOOL_NAMES.SCAN_NETWORK_ERRORS,
			serverMode,
			tdClient,
			async ({ scope = "/project1", maxDepth = 5, includeWarnings = true }) => {
				try {
					const script = buildErrorScanScript(scope, maxDepth, includeWarnings);
					const result = await tdClient.execPythonScript({
						mode: "read-only",
						script,
					});

					if (!result.success) {
						return {
							content: [
								{
									text: `Error scan failed: ${result.error}`,
									type: "text" as const,
								},
							],
							isError: true,
						};
					}

					const data = result.data as { result?: string };
					let scanData: Record<string, unknown>;
					try {
						if (typeof data.result === "string") {
							scanData = JSON.parse(data.result) as Record<string, unknown>;
						} else if (data.result != null) {
							scanData = data.result as unknown as Record<string, unknown>;
						} else {
							scanData = {};
						}
					} catch {
						scanData = {};
					}

					const text = formatErrorScanResult(scanData, scope, maxDepth);

					logger.sendLog({
						data: { includeWarnings, maxDepth, scope },
						level: "debug",
						logger: "scan_network_errors",
					});

					return {
						content: [{ text, type: "text" as const }],
					};
				} catch (error) {
					return handleToolError(error, logger, TOOL_NAMES.SCAN_NETWORK_ERRORS);
				}
			},
		),
	);
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

interface Issue {
	path: string;
	name: string;
	opType: string;
	family: string;
	severity: "error" | "warning";
	message: string;
}

function escapeCell(text: string): string {
	return text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function pushIssueTable(lines: string[], issues: Issue[]): void {
	if (issues.length === 0) return;
	lines.push("");
	lines.push("| Operator | Type | Family | Message |");
	lines.push("|----------|------|--------|---------|");
	for (const issue of issues) {
		lines.push(
			`| ${issue.path} | ${issue.opType} | ${issue.family} | ${escapeCell(issue.message)} |`,
		);
	}
}

function formatErrorScanResult(
	data: Record<string, unknown>,
	scope: string,
	maxDepth: number,
): string {
	// Handle script-level error
	if (data.error) {
		return `## Network Error Scan\n\n**Error:** ${data.error}`;
	}

	const totalScanned = (data.totalScanned as number) ?? 0;
	const truncated = data.truncated as boolean;
	const errorCount = (data.errorCount as number) ?? 0;
	const warningCount = (data.warningCount as number) ?? 0;
	const warningsSupported = data.warningsSupported as boolean;
	const issues = (data.issues as Issue[]) ?? [];

	const lines: string[] = ["## Network Error Scan\n"];
	lines.push(
		`**Scope:** \`${scope}\` | **Depth:** ${maxDepth} | **Scanned:** ${totalScanned} operators`,
	);
	lines.push(`**Errors:** ${errorCount} | **Warnings:** ${warningCount}`);

	if (truncated) {
		lines.push(
			"\n> **Note:** Scan capped at 500 operators. Narrow the scope for a complete scan.",
		);
	}

	const errors = issues.filter((i) => i.severity === "error");
	const warnings = issues.filter((i) => i.severity === "warning");

	if (errors.length > 0) {
		lines.push(`\n### Errors (${errors.length})`);
		pushIssueTable(lines, errors);
	}

	if (warnings.length > 0) {
		lines.push(`\n### Warnings (${warnings.length})`);
		pushIssueTable(lines, warnings);
	}

	if (errorCount === 0 && warningCount === 0) {
		lines.push("\nNo errors or warnings found.");
	}

	if (warningsSupported === false) {
		lines.push(
			"\n> `.warnings()` not available on this TD build — only errors were collected.",
		);
	}

	return lines.join("\n");
}
