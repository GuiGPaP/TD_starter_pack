import type { AuditEntry, AuditOutcome, ExecMode } from "./types.js";

const MAX_ENTRIES = 100;
const MAX_SCRIPT_LENGTH = 500;

/**
 * Redact secrets from a string before storing in the audit log.
 * - Windows user paths: C:\Users\xxx\... → C:\Users\***\...
 * - Tokens/keys: key = "..." → key = "***"
 */
export function redactSecrets(text: string): string {
	return text
		.replace(/([A-Za-z]:\\Users\\)[^\\]+/g, "$1***")
		.replace(
			/((?:key|token|secret|password|api_key|apikey)\s*[=:]\s*['"])[^'"]+(['"])/gi,
			"$1***$2",
		)
		.replace(/(Bearer\s+)\S+/gi, "$1***")
		.replace(/(Basic\s+)\S+/gi, "$1***")
		.replace(/:\/\/[^@/\s]+:[^@/\s]+@/g, "://***:***@");
}

function truncateScript(script: string): string {
	if (script.length <= MAX_SCRIPT_LENGTH) return script;
	return `${script.slice(0, MAX_SCRIPT_LENGTH)}... (truncated)`;
}

export interface AuditLogFilter {
	limit?: number;
	mode?: ExecMode;
	outcome?: AuditOutcome;
}

/**
 * In-memory ring buffer for execute_python_script audit entries.
 * Max 100 entries, newest-first retrieval, automatic secret redaction.
 */
export class ExecAuditLog {
	private entries: AuditEntry[] = [];
	private nextId = 1;

	get size(): number {
		return this.entries.length;
	}

	append(
		entry: Omit<AuditEntry, "id" | "script" | "timestamp"> & {
			script: string;
		},
	): AuditEntry {
		const auditEntry: AuditEntry = {
			...entry,
			id: this.nextId++,
			script: redactSecrets(truncateScript(entry.script)),
			timestamp: new Date().toISOString(),
		};

		if (entry.error) {
			auditEntry.error = redactSecrets(entry.error);
		}

		if (this.entries.length >= MAX_ENTRIES) {
			this.entries.shift();
		}
		this.entries.push(auditEntry);

		return auditEntry;
	}

	getEntries(filter?: AuditLogFilter): AuditEntry[] {
		let result = [...this.entries].reverse(); // newest first

		if (filter?.mode) {
			result = result.filter((e) => e.mode === filter.mode);
		}
		if (filter?.outcome) {
			result = result.filter((e) => e.outcome === filter.outcome);
		}

		const limit = filter?.limit ?? 20;
		return result.slice(0, limit);
	}

	clear(): void {
		this.entries = [];
	}
}
