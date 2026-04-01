import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import type { ILogger } from "../../../core/logger.js";
import type { ExecAuditLog } from "../security/index.js";

const getExecLogSchema = {
	limit: z
		.number()
		.int()
		.min(1)
		.max(100)
		.describe("Max entries to return (default: 20, max: 100)")
		.optional(),
	mode: z
		.enum(["read-only", "safe-write", "full-exec"])
		.describe("Filter by execution mode")
		.optional(),
	outcome: z
		.enum(["executed", "blocked", "previewed", "error"])
		.describe("Filter by outcome type")
		.optional(),
};

type GetExecLogParams = {
	limit?: number;
	mode?: "full-exec" | "read-only" | "safe-write";
	outcome?: "blocked" | "error" | "executed" | "previewed";
};

// --- Formatting helpers ---

const STATUS_LABELS: Record<string, string> = {
	blocked: "BLOCKED",
	error: "ERROR",
	executed: "OK",
	previewed: "PREVIEW",
};

function formatExecLogEntry(
	lines: string[],
	e: ReturnType<ExecAuditLog["getEntries"]>[number],
): void {
	const status = STATUS_LABELS[e.outcome] ?? "ERROR";
	lines.push(
		`#${e.id} [${status}] mode=${e.mode} ${e.durationMs}ms — ${e.script.slice(0, 80)}`,
	);
	if (e.error) {
		lines.push(`  Error: ${e.error.slice(0, 120)}`);
	}
	if (e.violations && e.violations.length > 0) {
		for (const v of e.violations.slice(0, 3)) {
			lines.push(`  L${v.line}: ${v.description}`);
		}
		if (e.violations.length > 3) {
			lines.push(`  ... and ${e.violations.length - 3} more`);
		}
	}
}

// --- Registration ---

export function registerExecLogTools(
	server: McpServer,
	_logger: ILogger,
	auditLog: ExecAuditLog,
): void {
	server.tool(
		TOOL_NAMES.GET_EXEC_LOG,
		"Get the execution audit log for execute_python_script. Shows recent executions, blocked attempts, and previews. Works offline.",
		getExecLogSchema,
		async (params: GetExecLogParams = {}) => {
			const entries = auditLog.getEntries({
				limit: params.limit,
				mode: params.mode,
				outcome: params.outcome,
			});

			if (entries.length === 0) {
				return {
					content: [
						{ text: "No audit log entries found.", type: "text" as const },
					],
				};
			}

			const lines = [`Execution audit log (${entries.length} entries):\n`];
			for (const e of entries) {
				formatExecLogEntry(lines, e);
			}
			return { content: [{ text: lines.join("\n"), type: "text" as const }] };
		},
	);
}
