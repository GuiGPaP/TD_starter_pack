export type ExecMode = "read-only" | "safe-write" | "full-exec";

export const EXEC_MODE_ORDER: Record<ExecMode, number> = {
	"full-exec": 2,
	"read-only": 0,
	"safe-write": 1,
};

export type ViolationCategory =
	| "delete"
	| "exec"
	| "network"
	| "system"
	| "write";

export interface Violation {
	category: ViolationCategory;
	description: string;
	line: number;
	minMode: ExecMode;
	snippet: string;
}

export interface AnalysisResult {
	allowed: boolean;
	confidence: "high" | "low" | "medium";
	requestedMode: ExecMode;
	requiredMode: ExecMode;
	violations: Violation[];
}

export type AuditOutcome = "blocked" | "error" | "executed" | "previewed";

export interface AuditEntry {
	allowed: boolean;
	durationMs: number;
	error?: string;
	id: number;
	mode: ExecMode;
	outcome: AuditOutcome;
	preview: boolean;
	script: string;
	timestamp: string;
	violations?: Violation[];
}
