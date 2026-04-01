/**
 * PreToolUse hook for Bash — blocks destructive commands.
 * Receives Claude Code tool JSON on stdin.
 *
 * Strips quoted strings and heredocs before matching so that commit messages
 * or echo statements describing destructive commands don't trigger the guard.
 *
 * Ported from etch/.claude/hooks/guard-destructive.ts (Bun → Node.js).
 */

export interface HookInput {
	tool_input: {
		command: string;
	};
}

export const BLOCKED_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
	[/rm\s+-rf\b/, "rm -rf"],
	[/rm\s+-r\s+\//, "rm -r /"],
	[/rm\s+(-[a-z]*r[a-z]*\s+-[a-z]*f|-[a-z]*f[a-z]*\s+-[a-z]*r)\b/, "rm -r -f"],
	[/rm\s+--recursive\b/, "rm --recursive"],
	[/git\s+push\s+--force-with-lease\b/, "git push --force-with-lease"],
	[/git\s+push\s+--force(?!-)/, "git push --force"],
	[/git\s+push\s+-f\b/, "git push -f"],
	[/git\s+reset\s+--hard\b/, "git reset --hard"],
	[/git\s+clean\s+-f/, "git clean -f"],
	[/git\s+checkout\s+\.$/, "git checkout ."],
	[/git\s+checkout\s+--\s+\.$/, "git checkout -- ."],
	[/git\s+restore\s+\.$/, "git restore ."],
	[/git\s+branch\s+-D\b/, "git branch -D"],
	[/git\s+stash\s+drop\b/, "git stash drop"],
	[/git\s+stash\s+clear\b/, "git stash clear"],
];

/**
 * Strip string literals and heredocs so their content doesn't trigger guards.
 * e.g. `git commit -m "don't rm -rf"` won't match.
 */
export function stripStringLiterals(cmd: string): string {
	// Strip heredocs: <<'EOF' ... EOF, <<"EOF" ... EOF, <<EOF ... EOF
	let stripped = cmd.replace(
		/<<-?\s*'?(\w+)'?.*?\n[\s\S]*?\n\s*\1/g,
		"",
	);
	// Strip double-quoted strings (non-greedy, respecting escapes)
	stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
	// Strip single-quoted strings (no escapes in single quotes)
	stripped = stripped.replace(/'[^']*'/g, "''");
	return stripped;
}

/**
 * Check a command against blocked patterns.
 * Returns the matched label or null if safe.
 */
export function checkCommand(cmd: string): string | null {
	const sanitized = stripStringLiterals(cmd);
	for (const [pattern, label] of BLOCKED_PATTERNS) {
		if (pattern.test(sanitized)) {
			return label;
		}
	}
	return null;
}

/**
 * Parse hook JSON input from stdin.
 * Returns the command string or null if unparseable.
 */
export function parseHookInput(raw: string): string | null {
	try {
		const parsed = JSON.parse(raw) as HookInput;
		return parsed.tool_input?.command ?? null;
	} catch {
		return null;
	}
}

/**
 * Run the guard: read stdin JSON, check command, output deny decision if needed.
 */
export async function main(): Promise<void> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}

	const input = Buffer.concat(chunks).toString("utf-8");
	const cmd = parseHookInput(input);

	if (cmd) {
		const match = checkCommand(cmd);
		if (match) {
			const output = JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: `Destructive command blocked: ${match}\nCommand: ${cmd}`,
				},
			});
			process.stdout.write(output + "\n");
		}
	}
}

// Run only when executed directly (not imported by tests).
// In .mts, process.argv[1] contains the script path when run directly.
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("guard-destructive.mts");
if (isMain) {
	main();
}
