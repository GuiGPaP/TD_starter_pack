import {
	type AnalysisResult,
	EXEC_MODE_ORDER,
	type ExecMode,
	type Violation,
	type ViolationCategory,
} from "./types.js";

interface PatternRule {
	category: ViolationCategory;
	description: string;
	minMode: ExecMode;
	pattern: RegExp;
}

/**
 * Patterns that escalate the required mode from read-only to safe-write.
 * These represent write operations that don't destroy data or access the OS.
 */
const SAFE_WRITE_PATTERNS: PatternRule[] = [
	{
		category: "write",
		description: "parameter assignment requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.par\.\w+\s*=[^=]/,
	},
	{
		category: "write",
		description: ".create() requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.create\s*\(/,
	},
	{
		category: "write",
		description: ".copy() requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.copy\s*\(/,
	},
	{
		category: "write",
		description: ".connect() requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.connect\s*\(/,
	},
	{
		category: "write",
		description: ".text assignment requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.text\s*=[^=]/,
	},
	{
		category: "write",
		description: ".insertRow() requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.insertRow\s*\(/,
	},
	{
		category: "write",
		description: ".appendRow() requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.appendRow\s*\(/,
	},
	{
		category: "write",
		description: ".deleteRow() requires safe-write mode",
		minMode: "safe-write",
		pattern: /\.deleteRow\s*\(/,
	},
];

/**
 * Patterns that escalate the required mode to full-exec.
 * These represent destructive, system-level, or dynamic operations.
 */
const FULL_EXEC_PATTERNS: PatternRule[] = [
	{
		category: "delete",
		description: ".destroy() requires full-exec mode",
		minMode: "full-exec",
		pattern: /\.destroy\s*\(/,
	},
	{
		category: "system",
		description: "os.remove/unlink requires full-exec mode",
		minMode: "full-exec",
		pattern: /os\.(remove|unlink|rmdir)\s*\(/,
	},
	{
		category: "system",
		description: "shutil.rmtree requires full-exec mode",
		minMode: "full-exec",
		pattern: /shutil\.rmtree\s*\(/,
	},
	{
		category: "system",
		description: "subprocess usage requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bsubprocess\b/,
	},
	{
		category: "system",
		description: "os.system() requires full-exec mode",
		minMode: "full-exec",
		pattern: /os\.system\s*\(/,
	},
	{
		category: "exec",
		description: "exec() requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bexec\s*\(/,
	},
	{
		category: "exec",
		description: "eval() requires full-exec mode",
		minMode: "full-exec",
		pattern: /\beval\s*\(/,
	},
	{
		category: "exec",
		description: "compile() requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bcompile\s*\(/,
	},
	{
		category: "exec",
		description: "__import__() requires full-exec mode",
		minMode: "full-exec",
		pattern: /__import__\s*\(/,
	},
	{
		category: "system",
		description: "open() with write mode requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bopen\s*\([^)]*['"][wab]/,
	},
	{
		category: "network",
		description: "socket usage requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bsocket\b/,
	},
	{
		category: "network",
		description: "urllib usage requires full-exec mode",
		minMode: "full-exec",
		pattern: /\burllib\b/,
	},
	{
		category: "network",
		description: "requests usage requires full-exec mode",
		minMode: "full-exec",
		pattern: /\brequests\./,
	},
	{
		category: "system",
		description: "sys.exit/quit/exit requires full-exec mode",
		minMode: "full-exec",
		pattern: /\b(sys\.exit|quit|exit)\s*\(/,
	},
	{
		category: "system",
		description: "import os/subprocess/shutil requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bimport\s+(os|subprocess|shutil|pathlib|tempfile)\b/,
	},
	{
		category: "system",
		description: "from os/subprocess import requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bfrom\s+(os|subprocess|shutil|pathlib|tempfile)\b/,
	},
	{
		category: "exec",
		description: "importlib usage requires full-exec mode",
		minMode: "full-exec",
		pattern: /\bimportlib\b/,
	},
	{
		category: "exec",
		description: "getattr on __builtins__ requires full-exec mode",
		minMode: "full-exec",
		pattern: /getattr\s*\(\s*__builtins__/,
	},
];

const ALL_PATTERNS = [...SAFE_WRITE_PATTERNS, ...FULL_EXEC_PATTERNS];

/**
 * Patterns that reduce confidence (dynamic/reflective constructs).
 */
const LOW_CONFIDENCE_PATTERNS = [
	/\beval\s*\(/,
	/\bexec\s*\(/,
	/\bgetattr\s*\(/,
	/\b__import__\s*\(/,
	/\bimportlib\b/,
];

const MEDIUM_CONFIDENCE_PATTERNS = [
	/\bfor\b.*\bin\b/,
	/\bwhile\b/,
	/\bsetattr\s*\(/,
];

/**
 * Strip Python-style inline comments from a line.
 * Naive approach: strips anything after # that isn't inside quotes.
 */
function stripComment(line: string): string {
	let inString: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inString) {
			if (ch === inString && line[i - 1] !== "\\") {
				inString = null;
			}
		} else if (ch === "'" || ch === '"') {
			inString = ch;
		} else if (ch === "#") {
			return line.slice(0, i);
		}
	}
	return line;
}

/**
 * Analyze a Python script and determine the minimum execution mode required.
 *
 * This is a pattern-based guard rail, NOT a security sandbox.
 * Dynamic constructs (eval, exec, getattr) can bypass the analysis.
 */
export function analyzeScript(
	script: string,
	requestedMode: ExecMode,
): AnalysisResult {
	// Compute confidence regardless of mode (eval/exec lower confidence)
	let confidence: "high" | "low" | "medium" = "high";
	if (LOW_CONFIDENCE_PATTERNS.some((p) => p.test(script))) {
		confidence = "low";
	} else if (MEDIUM_CONFIDENCE_PATTERNS.some((p) => p.test(script))) {
		confidence = "medium";
	}

	if (requestedMode === "full-exec") {
		return {
			allowed: true,
			confidence,
			requestedMode,
			requiredMode: "full-exec",
			violations: [],
		};
	}

	const lines = script.split("\n");
	const violations: Violation[] = [];
	let maxMode: ExecMode = "read-only";

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const stripped = stripComment(raw).trim();
		if (!stripped) continue;

		for (const rule of ALL_PATTERNS) {
			if (rule.pattern.test(stripped)) {
				const match = stripped.match(rule.pattern);
				violations.push({
					category: rule.category,
					description: rule.description,
					line: i + 1,
					minMode: rule.minMode,
					snippet: match ? match[0] : stripped.slice(0, 40),
				});
				if (EXEC_MODE_ORDER[rule.minMode] > EXEC_MODE_ORDER[maxMode]) {
					maxMode = rule.minMode;
				}
			}
		}
	}

	return {
		allowed: EXEC_MODE_ORDER[maxMode] <= EXEC_MODE_ORDER[requestedMode],
		confidence,
		requestedMode,
		requiredMode: maxMode,
		violations,
	};
}
