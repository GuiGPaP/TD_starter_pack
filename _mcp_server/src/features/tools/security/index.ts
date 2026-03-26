export { ExecAuditLog, redactSecrets } from "./auditLog.js";
export { analyzeScript } from "./scriptAnalyzer.js";
export type {
	AnalysisResult,
	AuditEntry,
	AuditOutcome,
	ExecMode,
	Violation,
	ViolationCategory,
} from "./types.js";
export { EXEC_MODE_ORDER } from "./types.js";
