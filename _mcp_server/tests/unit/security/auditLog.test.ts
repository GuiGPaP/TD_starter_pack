import { describe, expect, it } from "vitest";
import {
	ExecAuditLog,
	redactSecrets,
} from "../../../src/features/tools/security/auditLog.js";

describe("redactSecrets", () => {
	it("redacts Windows user paths", () => {
		expect(redactSecrets("C:\\Users\\guillaume\\Desktop\\file.txt")).toBe(
			"C:\\Users\\***\\Desktop\\file.txt",
		);
	});

	it("redacts tokens and secrets", () => {
		expect(redactSecrets('api_key = "sk-1234abc"')).toBe('api_key = "***"');
		expect(redactSecrets("token: 'mytoken123'")).toBe("token: '***'");
		expect(redactSecrets('PASSWORD = "hunter2"')).toBe('PASSWORD = "***"');
	});

	it("leaves normal text unchanged", () => {
		expect(redactSecrets("op('/project1').name")).toBe("op('/project1').name");
	});
});

describe("ExecAuditLog", () => {
	function makeEntry(overrides: Record<string, unknown> = {}) {
		return {
			allowed: true,
			durationMs: 10,
			mode: "full-exec" as const,
			outcome: "executed" as const,
			preview: false,
			script: "op('/').name",
			...overrides,
		};
	}

	it("appends entries with auto id and timestamp", () => {
		const log = new ExecAuditLog();
		const entry = log.append(makeEntry());
		expect(entry.id).toBe(1);
		expect(entry.timestamp).toBeTruthy();
		expect(log.size).toBe(1);
	});

	it("returns newest first", () => {
		const log = new ExecAuditLog();
		log.append(makeEntry({ script: "first" }));
		log.append(makeEntry({ script: "second" }));
		const entries = log.getEntries();
		expect(entries[0].script).toBe("second");
		expect(entries[1].script).toBe("first");
	});

	it("ring buffer drops oldest when full", () => {
		const log = new ExecAuditLog();
		for (let i = 0; i < 105; i++) {
			log.append(makeEntry({ script: `script-${i}` }));
		}
		expect(log.size).toBe(100);
		const entries = log.getEntries({ limit: 100 });
		// oldest should be script-5 (0-4 dropped)
		expect(entries[entries.length - 1].script).toBe("script-5");
		expect(entries[0].script).toBe("script-104");
	});

	it("monotonic IDs survive overflow", () => {
		const log = new ExecAuditLog();
		for (let i = 0; i < 105; i++) {
			log.append(makeEntry());
		}
		const entries = log.getEntries({ limit: 1 });
		expect(entries[0].id).toBe(105);
	});

	it("filters by outcome", () => {
		const log = new ExecAuditLog();
		log.append(makeEntry({ outcome: "executed" }));
		log.append(makeEntry({ outcome: "blocked" }));
		log.append(makeEntry({ outcome: "executed" }));

		const blocked = log.getEntries({ outcome: "blocked" });
		expect(blocked).toHaveLength(1);
	});

	it("filters by mode", () => {
		const log = new ExecAuditLog();
		log.append(makeEntry({ mode: "read-only" }));
		log.append(makeEntry({ mode: "full-exec" }));

		const readOnly = log.getEntries({ mode: "read-only" });
		expect(readOnly).toHaveLength(1);
	});

	it("respects limit", () => {
		const log = new ExecAuditLog();
		for (let i = 0; i < 10; i++) {
			log.append(makeEntry());
		}
		expect(log.getEntries({ limit: 3 })).toHaveLength(3);
	});

	it("defaults to limit 20", () => {
		const log = new ExecAuditLog();
		for (let i = 0; i < 30; i++) {
			log.append(makeEntry());
		}
		expect(log.getEntries()).toHaveLength(20);
	});

	it("clear resets entries", () => {
		const log = new ExecAuditLog();
		log.append(makeEntry());
		log.append(makeEntry());
		log.clear();
		expect(log.size).toBe(0);
		expect(log.getEntries()).toHaveLength(0);
	});

	it("redacts scripts on storage", () => {
		const log = new ExecAuditLog();
		const entry = log.append(
			makeEntry({ script: "C:\\Users\\guillaume\\file.py" }),
		);
		expect(entry.script).toContain("***");
		expect(entry.script).not.toContain("guillaume");
	});

	it("truncates long scripts", () => {
		const log = new ExecAuditLog();
		const longScript = "x".repeat(600);
		const entry = log.append(makeEntry({ script: longScript }));
		expect(entry.script.length).toBeLessThan(600);
		expect(entry.script).toContain("truncated");
	});

	it("redacts errors", () => {
		const log = new ExecAuditLog();
		const entry = log.append(
			makeEntry({
				error: "Failed at C:\\Users\\admin\\script.py",
				outcome: "error",
			}),
		);
		expect(entry.error).toContain("***");
		expect(entry.error).not.toContain("admin");
	});
});
