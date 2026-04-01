import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripStringLiterals, checkCommand, parseHookInput } from "./guard-destructive.mts";

describe("stripStringLiterals", () => {
	it("removes double-quoted strings", () => {
		assert.equal(stripStringLiterals('echo "rm -rf /"'), 'echo ""');
	});

	it("removes single-quoted strings", () => {
		assert.equal(stripStringLiterals("echo 'git push --force'"), "echo ''");
	});

	it("handles escaped quotes in double strings", () => {
		assert.equal(stripStringLiterals('echo "he said \\"hi\\""'), 'echo ""');
	});

	it("removes heredocs", () => {
		const cmd = `cat <<EOF\nrm -rf /\ngit push --force\nEOF`;
		const result = stripStringLiterals(cmd);
		assert.ok(!result.includes("rm -rf"));
		assert.ok(!result.includes("git push --force"));
	});

	it("leaves unquoted content intact", () => {
		assert.equal(stripStringLiterals("ls -la /tmp"), "ls -la /tmp");
	});
});

describe("checkCommand", () => {
	it("blocks rm -rf", () => {
		assert.equal(checkCommand("rm -rf /tmp/foo"), "rm -rf");
	});

	it("blocks git push --force", () => {
		assert.equal(checkCommand("git push --force origin main"), "git push --force");
	});

	it("blocks git push -f", () => {
		assert.equal(checkCommand("git push -f"), "git push -f");
	});

	it("blocks git push --force-with-lease", () => {
		assert.equal(checkCommand("git push --force-with-lease"), "git push --force-with-lease");
	});

	it("blocks git reset --hard", () => {
		assert.equal(checkCommand("git reset --hard HEAD~1"), "git reset --hard");
	});

	it("blocks git clean -f", () => {
		assert.equal(checkCommand("git clean -fd"), "git clean -f");
	});

	it("blocks git checkout .", () => {
		assert.equal(checkCommand("git checkout ."), "git checkout .");
	});

	it("blocks git checkout -- .", () => {
		assert.equal(checkCommand("git checkout -- ."), "git checkout -- .");
	});

	it("blocks git restore .", () => {
		assert.equal(checkCommand("git restore ."), "git restore .");
	});

	it("blocks git branch -D", () => {
		assert.equal(checkCommand("git branch -D feature"), "git branch -D");
	});

	it("blocks git stash drop", () => {
		assert.equal(checkCommand("git stash drop"), "git stash drop");
	});

	it("blocks git stash clear", () => {
		assert.equal(checkCommand("git stash clear"), "git stash clear");
	});

	it("blocks rm --recursive", () => {
		assert.equal(checkCommand("rm --recursive /tmp"), "rm --recursive");
	});

	it("allows safe git commands", () => {
		assert.equal(checkCommand("git status"), null);
		assert.equal(checkCommand("git add ."), null);
		assert.equal(checkCommand("git commit -m 'fix bug'"), null);
		assert.equal(checkCommand("git push origin main"), null);
		assert.equal(checkCommand("git checkout feature-branch"), null);
		assert.equal(checkCommand("git branch -d merged-branch"), null);
		assert.equal(checkCommand("git stash"), null);
		assert.equal(checkCommand("git stash pop"), null);
	});

	it("does NOT trigger on rm -rf inside commit message", () => {
		assert.equal(
			checkCommand('git commit -m "removed rm -rf from script"'),
			null,
		);
	});

	it("does NOT trigger on force push inside single-quoted message", () => {
		assert.equal(
			checkCommand("git commit -m 'dont force push'"),
			null,
		);
	});

	it("does NOT trigger on destructive commands inside heredoc", () => {
		const cmd = `cat <<'EOF'\nrm -rf /\ngit push --force\nEOF\necho done`;
		assert.equal(checkCommand(cmd), null);
	});

	it("allows git checkout with specific file", () => {
		assert.equal(checkCommand("git checkout -- src/file.ts"), null);
	});
});

describe("parseHookInput", () => {
	it("extracts command from valid JSON", () => {
		const input = JSON.stringify({ tool_input: { command: "ls -la" } });
		assert.equal(parseHookInput(input), "ls -la");
	});

	it("returns null for invalid JSON", () => {
		assert.equal(parseHookInput("not json"), null);
	});

	it("returns null for missing tool_input", () => {
		assert.equal(parseHookInput("{}"), null);
	});

	it("returns null for missing command", () => {
		assert.equal(parseHookInput('{"tool_input":{}}'), null);
	});
});
