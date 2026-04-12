import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import { ServerMode } from "../../../src/core/serverMode.js";
import { registerProjectCatalogTools } from "../../../src/features/tools/handlers/projectCatalogTools.js";

type ToolCall = {
	description: string;
	handler: (params?: Record<string, unknown>) => Promise<unknown>;
	name: string;
	schema: unknown;
};

function createMockServer() {
	const tools: ToolCall[] = [];
	return {
		server: {
			tool: vi.fn(
				(
					name: string,
					description: string,
					schema: unknown,
					handler: (params?: Record<string, unknown>) => Promise<unknown>,
				) => {
					tools.push({ description, handler, name, schema });
				},
			),
		},
		tools,
	};
}

function getToolHandler(tools: ToolCall[], name: string) {
	const tool = tools.find((candidate) => candidate.name === name);
	if (!tool) throw new Error(`Tool ${name} not registered`);
	return tool.handler;
}

function writeManifest(toePath: string, name: string) {
	const manifestPath = toePath.replace(/\.toe$/, ".td-catalog.json");
	writeFileSync(
		manifestPath,
		JSON.stringify({
			file: `${name}.toe`,
			name,
			schemaVersion: "1.0",
		}),
	);
}

describe("Project Catalog Tools", () => {
	let mockServer: ReturnType<typeof createMockServer>;
	let rootDir: string;
	const mockLogger = { sendLog: vi.fn() };
	const liveServerMode = new ServerMode();

	beforeEach(() => {
		mockServer = createMockServer();
		rootDir = mkdtempSync(join(tmpdir(), "bulk-package-projects-"));
		liveServerMode.transitionOnline("test-build");
		vi.clearAllMocks();
	});

	afterEach(() => {
		rmSync(rootDir, { force: true, recursive: true });
		vi.useRealTimers();
	});

	it("registers bulk_package_projects", () => {
		registerProjectCatalogTools(
			mockServer.server as never,
			mockLogger,
			{} as never,
			liveServerMode,
		);

		expect(
			mockServer.tools.some(
				(tool) => tool.name === TOOL_NAMES.BULK_PACKAGE_PROJECTS,
			),
		).toBe(true);
	});

	it("returns a dry-run plan without calling TouchDesigner", async () => {
		const indexedToe = join(rootDir, "indexed.toe");
		const pendingToe = join(rootDir, "pending.toe");
		writeFileSync(indexedToe, "");
		writeManifest(indexedToe, "indexed");
		writeFileSync(pendingToe, "");

		const mockTdClient = {
			execPythonScript: vi.fn(),
			healthProbe: vi.fn(),
			invalidateAndProbe: vi.fn(),
		};

		registerProjectCatalogTools(
			mockServer.server as never,
			mockLogger,
			mockTdClient as never,
			liveServerMode,
		);

		const handler = getToolHandler(
			mockServer.tools,
			TOOL_NAMES.BULK_PACKAGE_PROJECTS,
		);
		const result = (await handler({
			dryRun: true,
			rootDir,
		})) as {
			content: Array<{ text: string }>;
		};

		const text = result.content[0].text;
		expect(text).toContain("Mode: dry run");
		expect(text).toContain("Would package");
		expect(text).toContain(pendingToe);
		expect(text).toContain("Skipped");
		expect(text).toContain(indexedToe);
		expect(mockTdClient.execPythonScript).not.toHaveBeenCalled();
		expect(mockTdClient.healthProbe).not.toHaveBeenCalled();
	});

	it("packages a project and restores the original one", async () => {
		vi.useFakeTimers();
		const pendingToe = join(rootDir, "pending.toe");
		writeFileSync(pendingToe, "");

		const mockTdClient = {
			execPythonScript: vi
				.fn()
				.mockResolvedValueOnce({
					data: {
						result: { modified: false, toePath: "C:/Projects/original.toe" },
					},
					success: true,
				})
				.mockRejectedValueOnce(new Error("socket hang up"))
				.mockResolvedValueOnce({
					data: {
						result: { toePath: pendingToe.replace(/\\/g, "/") },
					},
					success: true,
				})
				.mockResolvedValueOnce({
					data: {
						result: {
							jsonPath: "C:/Projects/pending.td-catalog.json",
							mdPath: "C:/Projects/pending.td-catalog.md",
							name: "pending",
							operatorCount: 42,
							pngPath: "C:/Projects/pending.td-catalog.png",
							warnings: [],
						},
					},
					success: true,
				})
				.mockRejectedValueOnce(new Error("socket hang up"))
				.mockResolvedValueOnce({
					data: {
						result: { toePath: "C:/Projects/original.toe" },
					},
					success: true,
				}),
			healthProbe: vi.fn().mockResolvedValue({
				build: "test-build",
				compatible: true,
				error: null,
				lastSeen: "2026-04-12T10:00:00.000Z",
				latencyMs: 10,
				online: true,
			}),
			invalidateAndProbe: vi.fn().mockResolvedValue(undefined),
		};
		const mockAuditLog = { append: vi.fn() };

		registerProjectCatalogTools(
			mockServer.server as never,
			mockLogger,
			mockTdClient as never,
			liveServerMode,
			mockAuditLog as never,
		);

		const handler = getToolHandler(
			mockServer.tools,
			TOOL_NAMES.BULK_PACKAGE_PROJECTS,
		);

		const promise = handler({
			loadTimeoutSeconds: 1,
			rootDir,
		}) as Promise<{
			content: Array<{ text: string }>;
		}>;
		await vi.runAllTimersAsync();
		const result = await promise;

		const text = result.content[0].text;
		expect(text).toContain("Packaged: 1");
		expect(text).toContain("Original project restored: yes");
		expect(text).toContain(pendingToe);
		expect(mockTdClient.execPythonScript).toHaveBeenCalledTimes(6);
		expect(mockTdClient.healthProbe).toHaveBeenCalledTimes(2);
		expect(mockAuditLog.append).toHaveBeenCalledTimes(1);
	});

	it("packages the current project without reloading it first", async () => {
		const currentToe = join(rootDir, "current.toe");
		writeFileSync(currentToe, "");

		const mockTdClient = {
			execPythonScript: vi
				.fn()
				.mockResolvedValueOnce({
					data: {
						result: {
							modified: false,
							toePath: currentToe.replace(/\\/g, "/"),
						},
					},
					success: true,
				})
				.mockResolvedValueOnce({
					data: {
						result: {
							jsonPath: `${currentToe.replace(/\\/g, "/").replace(/\\.toe$/, "")}.td-catalog.json`,
							mdPath: `${currentToe.replace(/\\/g, "/").replace(/\\.toe$/, "")}.td-catalog.md`,
							name: "current",
							operatorCount: 7,
							pngPath: null,
							warnings: ["No suitable TOP found for thumbnail"],
						},
					},
					success: true,
				}),
			healthProbe: vi.fn(),
			invalidateAndProbe: vi.fn(),
		};

		registerProjectCatalogTools(
			mockServer.server as never,
			mockLogger,
			mockTdClient as never,
			liveServerMode,
		);

		const handler = getToolHandler(
			mockServer.tools,
			TOOL_NAMES.BULK_PACKAGE_PROJECTS,
		);
		const result = (await handler({
			rootDir,
		})) as {
			content: Array<{ text: string }>;
		};

		const text = result.content[0].text;
		expect(text).toContain("Packaged: 1");
		expect(text).toContain("Original project restored: yes");
		expect(mockTdClient.execPythonScript).toHaveBeenCalledTimes(2);
		expect(mockTdClient.healthProbe).not.toHaveBeenCalled();
	});

	it("aborts after three consecutive load timeouts", async () => {
		vi.useFakeTimers();
		for (const name of ["one", "two", "three", "four"]) {
			writeFileSync(join(rootDir, `${name}.toe`), "");
		}

		const mockTdClient = {
			execPythonScript: vi
				.fn()
				.mockResolvedValueOnce({
					data: {
						result: { modified: false, toePath: "C:/Projects/original.toe" },
					},
					success: true,
				})
				.mockRejectedValue(new Error("socket hang up")),
			healthProbe: vi.fn().mockResolvedValue({
				build: "test-build",
				compatible: null,
				error: "offline",
				lastSeen: null,
				latencyMs: 20,
				online: false,
			}),
			invalidateAndProbe: vi.fn().mockResolvedValue(undefined),
		};

		registerProjectCatalogTools(
			mockServer.server as never,
			mockLogger,
			mockTdClient as never,
			liveServerMode,
		);

		const handler = getToolHandler(
			mockServer.tools,
			TOOL_NAMES.BULK_PACKAGE_PROJECTS,
		);

		const promise = handler({
			loadTimeoutSeconds: 1,
			rootDir,
			skipAlreadyPackaged: false,
		}) as Promise<{
			content: Array<{ text: string }>;
		}>;
		await vi.runAllTimersAsync();
		const result = await promise;

		const text = result.content[0].text;
		expect(text).toContain("Batch aborted after repeated load timeouts.");
		expect(text).toContain("Failed (3):");
		expect(text).toContain("Skipped (1):");
		expect(text).toContain("batch-aborted");
	});

	it("packages the current project, then skips switching away when it has unsaved changes", async () => {
		const currentToe = join(rootDir, "current.toe");
		const otherToe = join(rootDir, "other.toe");
		writeFileSync(currentToe, "");
		writeFileSync(otherToe, "");

		const mockTdClient = {
			execPythonScript: vi
				.fn()
				.mockResolvedValueOnce({
					data: {
						result: {
							modified: true,
							toePath: currentToe.replace(/\\/g, "/"),
						},
					},
					success: true,
				})
				.mockResolvedValueOnce({
					data: {
						result: {
							jsonPath: `${currentToe.replace(/\\/g, "/").replace(/\\.toe$/, "")}.td-catalog.json`,
							mdPath: `${currentToe.replace(/\\/g, "/").replace(/\\.toe$/, "")}.td-catalog.md`,
							name: "current",
							operatorCount: 11,
							pngPath: null,
							warnings: [],
						},
					},
					success: true,
				}),
			healthProbe: vi.fn(),
			invalidateAndProbe: vi.fn(),
		};

		registerProjectCatalogTools(
			mockServer.server as never,
			mockLogger,
			mockTdClient as never,
			liveServerMode,
		);

		const handler = getToolHandler(
			mockServer.tools,
			TOOL_NAMES.BULK_PACKAGE_PROJECTS,
		);
		const result = (await handler({
			rootDir,
			skipAlreadyPackaged: false,
		})) as {
			content: Array<{ text: string }>;
		};

		const text = result.content[0].text;
		expect(text).toContain("Packaged: 1 | Failed: 0 | Skipped: 1");
		expect(text).toContain(currentToe);
		expect(text).toContain(otherToe);
		expect(text).toContain("current-project-modified");
		expect(text).toContain("unsaved changes");
		expect(mockTdClient.execPythonScript).toHaveBeenCalledTimes(2);
		expect(mockTdClient.healthProbe).not.toHaveBeenCalled();
	});
});
