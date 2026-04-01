/**
 * Stop hook — scope-aware quality gate.
 * Detects which boundaries changed and runs the appropriate checks.
 * Exit 0 = clean, exit 2 = errors found (blocks session completion).
 */

import { execSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Scope detection
// ---------------------------------------------------------------------------

type Scope = "python" | "typescript" | "tddocker";

function classifyFile(filePath: string): Scope | null {
	const f = filePath.replace(/\\/g, "/");
	if (f.startsWith("modules/") && f.endsWith(".py")) return "python";
	if (f.startsWith("_mcp_server/") && f.endsWith(".ts")) return "typescript";
	if (f.startsWith("TDDocker/python/") && f.endsWith(".py")) return "tddocker";
	return null;
}

function getChangedFiles(cwd: string): string[] {
	const lines = (cmd: string): string[] => {
		try {
			return execSync(cmd, { cwd, encoding: "utf-8" })
				.split("\n")
				.filter(Boolean);
		} catch {
			return [];
		}
	};
	const unstaged = lines("git diff --name-only");
	const staged = lines("git diff --cached --name-only");
	const untracked = lines("git ls-files --others --exclude-standard");
	return [...new Set([...unstaged, ...staged, ...untracked])];
}

function detectScopes(files: string[]): Set<Scope> {
	const scopes = new Set<Scope>();
	for (const f of files) {
		const scope = classifyFile(f);
		if (scope) scopes.add(scope);
	}
	return scopes;
}

// ---------------------------------------------------------------------------
// Check runners
// ---------------------------------------------------------------------------

interface CheckResult {
	name: string;
	ok: boolean;
	output: string;
}

function runCheck(name: string, cmd: string, cwd: string): CheckResult {
	try {
		execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
		return { name, ok: true, output: "" };
	} catch (err: unknown) {
		const e = err as { stdout?: string; stderr?: string };
		const output = [e.stdout ?? "", e.stderr ?? ""].filter(Boolean).join("\n");
		return { name, ok: false, output };
	}
}

function checkPython(repoRoot: string): CheckResult[] {
	return [
		runCheck("ruff check modules/", "uv run ruff check modules/", repoRoot),
		runCheck("ruff format modules/", "uv run ruff format --check modules/", repoRoot),
		runCheck("pyright modules/", "uv run pyright", repoRoot),
	];
}

function checkTypeScript(repoRoot: string): CheckResult[] {
	const mcpDir = resolve(repoRoot, "_mcp_server");
	return [
		runCheck("tsc --noEmit", "npx tsc --noEmit", mcpDir),
		// biome check on the whole src/ — fast enough
		runCheck("biome check", "npx biome check src/", mcpDir),
	];
}

function checkTDDocker(repoRoot: string): CheckResult[] {
	const dockerDir = resolve(repoRoot, "TDDocker");
	if (!existsSync(dockerDir)) return [];
	return [
		runCheck("ruff check TDDocker/python/", "uv run ruff check python/", dockerDir),
		runCheck("ruff format TDDocker/python/", "uv run ruff format --check python/", dockerDir),
		runCheck("pyright TDDocker/", "uv run pyright", dockerDir),
	];
}

function checkSyncModules(repoRoot: string): CheckResult[] {
	const script = resolve(repoRoot, "scripts/sync_modules.py");
	if (!existsSync(script)) return [];
	return [
		runCheck("sync-check", "uv run python scripts/sync_modules.py --check", repoRoot),
	];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const repoRoot = (() => {
	try {
		return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
	} catch {
		process.stderr.write("validate-on-stop: not in a git repo\n");
		process.exit(0);
	}
})();

const changedFiles = getChangedFiles(repoRoot);
if (changedFiles.length === 0) {
	process.exit(0);
}

const scopes = detectScopes(changedFiles);
if (scopes.size === 0) {
	process.exit(0);
}

const results: CheckResult[] = [];

if (scopes.has("python")) {
	results.push(...checkPython(repoRoot));
	results.push(...checkSyncModules(repoRoot));
}

if (scopes.has("typescript")) {
	results.push(...checkTypeScript(repoRoot));
}

if (scopes.has("tddocker")) {
	results.push(...checkTDDocker(repoRoot));
}

const failures = results.filter((r) => !r.ok);

if (failures.length > 0) {
	process.stderr.write(
		`\n=== Stop hook: ${failures.length} check(s) failed ===\n`,
	);
	for (const f of failures) {
		process.stderr.write(`\n--- ${f.name} ---\n`);
		if (f.output) process.stderr.write(f.output + "\n");
	}
	process.exit(2);
} else {
	const scopeList = [...scopes].join(", ");
	process.stderr.write(`Stop hook: all checks passed (scopes: ${scopeList})\n`);
	process.exit(0);
}
