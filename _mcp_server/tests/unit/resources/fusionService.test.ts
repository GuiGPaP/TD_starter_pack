import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerMode } from "../../../src/core/serverMode.js";
import {
	FusionService,
	mergeOperatorEntry,
} from "../../../src/features/resources/fusionService.js";
import { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDOperatorEntry } from "../../../src/features/resources/types.js";
import type { ParameterSchema } from "../../../src/gen/endpoints/TouchDesignerAPI.js";

function makeOperatorEntry(
	overrides: Partial<TDOperatorEntry> = {},
): TDOperatorEntry {
	return {
		content: { summary: "GLSL shader" },
		id: "glsl-top",
		kind: "operator",
		payload: {
			opFamily: "TOP",
			opType: "glslTOP",
			parameters: [
				{
					description: "GLSL language version",
					label: "GLSL Version",
					name: "glslversion",
					style: "Menu",
				},
				{
					default: 1280,
					description: "Output width",
					label: "Resolution W",
					name: "resolutionw",
					style: "Int",
				},
			],
		},
		provenance: {
			confidence: "high",
			license: "Derivative",
			source: "td-docs",
		},
		searchKeywords: ["glsl"],
		title: "GLSL TOP",
		...overrides,
	} as TDOperatorEntry;
}

function makeLiveParams(): ParameterSchema[] {
	return [
		{
			default: "3.30",
			label: "GLSL Version",
			menuLabels: ["GLSL 1.20", "GLSL 3.30", "GLSL 4.50"],
			menuNames: ["1.20", "3.30", "4.50"],
			name: "glslversion",
			style: "Menu",
		},
		{
			clampMax: true,
			clampMin: true,
			default: 1920,
			label: "Resolution",
			max: 16384,
			min: 1,
			name: "resolutionw",
			style: "Int",
			val: 1920,
		},
		{
			default: 0,
			label: "Compute",
			name: "compute",
			style: "Toggle",
		},
	];
}

function createMockTdClient() {
	return {
		execPythonScript: vi.fn(),
		getNodeParameterSchema: vi.fn(),
	};
}

function createMockLogger() {
	return { sendLog: vi.fn() };
}

function createRegistryWithEntries(entries: TDOperatorEntry[]) {
	const registry = new KnowledgeRegistry();
	const entriesMap = (
		registry as unknown as {
			entries: Map<string, TDOperatorEntry>;
		}
	).entries;
	for (const entry of entries) {
		entriesMap.set(entry.id, entry);
	}
	return registry;
}

function requireValue<T>(value: T | null | undefined, label: string): T {
	if (value === null || value === undefined) {
		throw new Error(`Expected ${label}`);
	}
	return value;
}

describe("FusionService", () => {
	let serverMode: ServerMode;
	let mockClient: ReturnType<typeof createMockTdClient>;
	let mockLogger: ReturnType<typeof createMockLogger>;
	let registry: KnowledgeRegistry;
	let service: FusionService;

	beforeEach(() => {
		serverMode = new ServerMode();
		mockClient = createMockTdClient();
		mockLogger = createMockLogger();
		registry = createRegistryWithEntries([makeOperatorEntry()]);
		service = new FusionService(
			registry,
			mockClient as never,
			serverMode,
			mockLogger as never,
		);
	});

	it("should return undefined for unknown entry", async () => {
		const result = await service.getEntry("nonexistent");
		expect(result).toBeUndefined();
	});

	it("should return static entry when offline (docs-only)", async () => {
		// serverMode defaults to docs-only
		const result = requireValue(
			await service.getEntry("glsl-top"),
			"fusion result",
		);
		expect(result._meta.source).toBe("static");
		expect(result.entry.payload.liveParameters).toBeUndefined();
		expect(mockClient.execPythonScript).not.toHaveBeenCalled();
	});

	it("should return static when online but no instance found", async () => {
		serverMode.transitionOnline("2023.11000");

		mockClient.execPythonScript.mockResolvedValue({
			data: { result: null },
			success: true,
		});

		const result = requireValue(
			await service.getEntry("glsl-top"),
			"fusion result",
		);
		expect(result._meta.source).toBe("static");
		expect(result.entry.payload.liveParameters).toBeUndefined();
	});

	it("should return hybrid entry when instance found and params fetched", async () => {
		serverMode.transitionOnline("2023.11000");

		mockClient.execPythonScript.mockResolvedValue({
			data: { result: "/project1/glsl1" },
			success: true,
		});
		mockClient.getNodeParameterSchema.mockResolvedValue({
			data: { parameters: makeLiveParams() },
			success: true,
		});

		const result = requireValue(
			await service.getEntry("glsl-top"),
			"fusion result",
		);
		expect(result._meta.source).toBe("hybrid");
		expect(result._meta.tdBuild).toBe("2023.11000");
		expect(result._meta.enrichedAt).toBeDefined();

		// Static description preserved
		expect(result.entry.payload.parameters[0].description).toBe(
			"GLSL language version",
		);
		// Live style/default override
		expect(result.entry.payload.parameters[0].menuNames).toEqual([
			"1.20",
			"3.30",
			"4.50",
		]);
		expect(result.entry.payload.parameters[0].default).toBe("3.30");

		// liveParameters present
		expect(result.entry.payload.liveParameters).toHaveLength(3);

		// Live-only param NOT in static parameters
		const staticParamNames = result.entry.payload.parameters.map((p) => p.name);
		expect(staticParamNames).not.toContain("compute");
	});

	it("should cache result and not call TD on second request", async () => {
		serverMode.transitionOnline("2023.11000");

		mockClient.execPythonScript.mockResolvedValue({
			data: { result: "/project1/glsl1" },
			success: true,
		});
		mockClient.getNodeParameterSchema.mockResolvedValue({
			data: { parameters: makeLiveParams() },
			success: true,
		});

		await service.getEntry("glsl-top");
		await service.getEntry("glsl-top");

		expect(mockClient.execPythonScript).toHaveBeenCalledTimes(1);
		expect(mockClient.getNodeParameterSchema).toHaveBeenCalledTimes(1);
	});

	it("should invalidate cache on build change", async () => {
		serverMode.transitionOnline("2023.11000");

		mockClient.execPythonScript.mockResolvedValue({
			data: { result: "/project1/glsl1" },
			success: true,
		});
		mockClient.getNodeParameterSchema.mockResolvedValue({
			data: { parameters: makeLiveParams() },
			success: true,
		});

		await service.getEntry("glsl-top");

		// Simulate build change (without mode transition)
		(serverMode as unknown as { _tdBuild: string })._tdBuild = "2024.12000";

		await service.getEntry("glsl-top");

		// Should have called TD twice (cache invalidated)
		expect(mockClient.execPythonScript).toHaveBeenCalledTimes(2);
	});

	it("should invalidate cache on mode change", async () => {
		serverMode.transitionOnline("2023.11000");

		mockClient.execPythonScript.mockResolvedValue({
			data: { result: "/project1/glsl1" },
			success: true,
		});
		mockClient.getNodeParameterSchema.mockResolvedValue({
			data: { parameters: makeLiveParams() },
			success: true,
		});

		await service.getEntry("glsl-top");

		// Go offline then back online
		serverMode.transitionOffline();
		serverMode.transitionOnline("2023.11000");

		await service.getEntry("glsl-top");

		expect(mockClient.execPythonScript).toHaveBeenCalledTimes(2);
	});

	it("should return static when getNodeParameterSchema fails", async () => {
		serverMode.transitionOnline("2023.11000");

		mockClient.execPythonScript.mockResolvedValue({
			data: { result: "/project1/glsl1" },
			success: true,
		});
		mockClient.getNodeParameterSchema.mockResolvedValue({
			error: new Error("Node error"),
			success: false,
		});

		const result = requireValue(
			await service.getEntry("glsl-top"),
			"fusion result",
		);
		expect(result._meta.source).toBe("static");
	});

	it("should return static when execPythonScript throws", async () => {
		serverMode.transitionOnline("2023.11000");

		mockClient.execPythonScript.mockRejectedValue(new Error("Connection lost"));

		const result = requireValue(
			await service.getEntry("glsl-top"),
			"fusion result",
		);
		expect(result._meta.source).toBe("static");
	});
});

describe("mergeOperatorEntry", () => {
	it("should enrich static params with live data", () => {
		const staticEntry = makeOperatorEntry();
		const liveParams = makeLiveParams();

		const result = mergeOperatorEntry(staticEntry, liveParams);

		// glslversion: live menuNames/menuLabels injected
		const glslParam = result.payload.parameters.find(
			(p) => p.name === "glslversion",
		);
		const requiredGlslParam = requireValue(glslParam, "glslversion param");
		expect(requiredGlslParam.menuNames).toEqual(["1.20", "3.30", "4.50"]);
		expect(requiredGlslParam.description).toBe("GLSL language version"); // static wins

		// resolutionw: live default/min/max override
		const resParam = result.payload.parameters.find(
			(p) => p.name === "resolutionw",
		);
		const requiredResParam = requireValue(resParam, "resolutionw param");
		expect(requiredResParam.default).toBe(1920); // live overrides static 1280
		expect(requiredResParam.min).toBe(1);
		expect(requiredResParam.max).toBe(16384);
		expect(requiredResParam.description).toBe("Output width"); // static wins
	});

	it("should include all live params in liveParameters", () => {
		const staticEntry = makeOperatorEntry();
		const liveParams = makeLiveParams();

		const result = mergeOperatorEntry(staticEntry, liveParams);

		const liveParameters = requireValue(
			result.payload.liveParameters,
			"live parameters",
		);
		expect(liveParameters).toHaveLength(3);
		expect(liveParameters[2].name).toBe("compute");
	});

	it("should not inject live-only params into static parameters", () => {
		const staticEntry = makeOperatorEntry();
		const liveParams = makeLiveParams();

		const result = mergeOperatorEntry(staticEntry, liveParams);

		const paramNames = result.payload.parameters.map((p) => p.name);
		expect(paramNames).toEqual(["glslversion", "resolutionw"]);
	});

	it("should handle empty live params", () => {
		const staticEntry = makeOperatorEntry();
		const result = mergeOperatorEntry(staticEntry, []);

		expect(result.payload.parameters).toHaveLength(2);
		expect(result.payload.liveParameters).toHaveLength(0);
	});
});
