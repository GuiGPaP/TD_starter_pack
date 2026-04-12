/**
 * Stop hook — scope-aware quality gate.
 * Detects which boundaries changed and runs the appropriate checks.
 * Exit 0 = clean, exit 2 = errors found (blocks session completion).
 */

import { execSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
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
		runCheck("pyright modules/", "uv run python -m pyright", repoRoot),
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
		runCheck("pyright TDDocker/", "uv run python -m pyright", dockerDir),
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
// Error log persistence
// ---------------------------------------------------------------------------

function persistErrors(repoRoot: string, failures: CheckResult[]): void {
	const logPath = resolve(repoRoot, "tasks/errors-log.md");
	const tasksDir = resolve(repoRoot, "tasks");
	if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

	const now = new Date().toISOString().slice(0, 19).replace("T", " ");
	const newEntries = failures.map((f) => {
		const excerpt = f.output.split("\n").filter(Boolean).slice(0, 3).join(" | ").slice(0, 200);
		return `- **${now}** [${f.name}] ${excerpt}`;
	});

	let content: string;
	if (existsSync(logPath)) {
		const existing = readFileSync(logPath, "utf-8");
		// Insert new entries after the Unresolved heading
		const marker = "## Unresolved\n";
		if (existing.includes(marker)) {
			const idx = existing.indexOf(marker) + marker.length;
			content = existing.slice(0, idx) + "\n" + newEntries.join("\n") + "\n" + existing.slice(idx);
		} else {
			content = existing + "\n" + newEntries.join("\n") + "\n";
		}
	} else {
		content = [
			"# Error Log",
			"",
			"Automatically captured by the stop hook. Review at session start.",
			"Move resolved entries to the Resolved section.",
			"",
			"## Unresolved",
			"",
			...newEntries,
			"",
			"## Resolved",
			"",
		].join("\n");
	}

	writeFileSync(logPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Lesson auto-scan (best-effort, requires TD online)
// ---------------------------------------------------------------------------

const TD_PORT = 9981;
const TD_TIMEOUT_MS = 2000;

function httpGet(path: string, timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = request(
			{ hostname: "localhost", port: TD_PORT, path, method: "GET", timeout: timeoutMs },
			(res) => {
				let data = "";
				res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
				res.on("end", () => resolve(data));
			},
		);
		req.on("error", reject);
		req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
		req.end();
	});
}

async function scanLessonCandidates(repoRoot: string): Promise<void> {
	try {
		// 1. Health check — bail if TD is offline
		await httpGet("/api/v1/health", TD_TIMEOUT_MS);

		// 2. Call scan_for_lessons (read-only preview)
		const body = await httpGet("/api/v1/td/lessons?autoCapture=false", TD_TIMEOUT_MS * 2);
		const parsed = JSON.parse(body);
		const candidates: string[] = parsed?.result?.candidates ?? parsed?.candidates ?? [];
		if (candidates.length === 0) return;

		// 3. Append to errors-log.md under Lesson Candidates
		const logPath = resolve(repoRoot, "tasks/errors-log.md");
		const tasksDir = resolve(repoRoot, "tasks");
		if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

		const now = new Date().toISOString().slice(0, 19).replace("T", " ");
		const entries = candidates.map((c: string) => `- **${now}** ${c}`);
		const section = `\n## Lesson Candidates\n\n${entries.join("\n")}\n`;

		if (existsSync(logPath)) {
			const existing = readFileSync(logPath, "utf-8");
			const marker = "## Lesson Candidates\n";
			if (existing.includes(marker)) {
				// Replace existing section
				const idx = existing.indexOf(marker);
				const nextSection = existing.indexOf("\n## ", idx + marker.length);
				const before = existing.slice(0, idx);
				const after = nextSection >= 0 ? existing.slice(nextSection) : "";
				writeFileSync(logPath, before + marker + "\n" + entries.join("\n") + "\n" + after, "utf-8");
			} else {
				writeFileSync(logPath, existing + section, "utf-8");
			}
		} else {
			writeFileSync(logPath, `# Error Log\n\nAutomatically captured by the stop hook.\n${section}`, "utf-8");
		}

		process.stderr.write(`Stop hook: found ${candidates.length} lesson candidate(s)\n`);
	} catch {
		// TD offline or endpoint unavailable — skip silently
	}
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

// Best-effort lesson scan (async, must await before exit)
await scanLessonCandidates(repoRoot);

if (failures.length > 0) {
	persistErrors(repoRoot, failures);
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
