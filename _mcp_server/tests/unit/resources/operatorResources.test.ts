import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FusionService } from "../../../src/features/resources/fusionService.js";
import { registerOperatorResources } from "../../../src/features/resources/handlers/operatorResources.js";
import { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type {
	EnrichedOperatorEntry,
	EnrichmentMeta,
	TDOperatorEntry,
} from "../../../src/features/resources/types.js";

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
					description: "GLSL version",
					name: "glslversion",
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

type RegisterCall = {
	name: string;
	uriOrTemplate: unknown;
	config: unknown;
	callback: (...args: unknown[]) => unknown;
};

function createMockServer() {
	const registeredResources: RegisterCall[] = [];
	return {
		registeredResources,
		server: {
			registerResource: vi.fn(
				(
					name: string,
					uriOrTemplate: unknown,
					config: unknown,
					callback: (...args: unknown[]) => unknown,
				) => {
					registeredResources.push({
						callback,
						config,
						name,
						uriOrTemplate,
					});
				},
			),
		},
	};
}

describe("registerOperatorResources", () => {
	let mockServer: ReturnType<typeof createMockServer>;
	let mockLogger: { sendLog: ReturnType<typeof vi.fn> };
	let registry: KnowledgeRegistry;
	let mockFusionService: {
		getEntry: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockServer = createMockServer();
		mockLogger = { sendLog: vi.fn() };
		registry = new KnowledgeRegistry();
		mockFusionService = { getEntry: vi.fn() };
	});

	function setupWithEntries(entries: TDOperatorEntry[]) {
		const entriesMap = (
			registry as unknown as {
				entries: Map<string, TDOperatorEntry>;
			}
		).entries;
		for (const entry of entries) {
			entriesMap.set(entry.id, entry);
		}

		registerOperatorResources(
			mockServer.server as never,
			mockLogger as never,
			registry,
			mockFusionService as unknown as FusionService,
		);
	}

	it("should register both static and template resources", () => {
		setupWithEntries([makeOperatorEntry()]);

		expect(mockServer.server.registerResource).toHaveBeenCalledTimes(2);

		const [staticCall, templateCall] = mockServer.registeredResources;
		expect(staticCall.name).toBe("TD Operator Index");
		expect(staticCall.uriOrTemplate).toBe("td://operators");

		expect(templateCall.name).toBe("TD Operator Detail");
		expect(typeof templateCall.uriOrTemplate).toBe("object");
	});

	it("td://operators should return versioned index JSON", () => {
		setupWithEntries([makeOperatorEntry()]);

		const staticCall = mockServer.registeredResources[0];
		const result = staticCall.callback() as {
			contents: Array<{ uri: string; text: string; mimeType: string }>;
		};

		expect(result.contents).toHaveLength(1);
		expect(result.contents[0].mimeType).toBe("application/json");

		const parsed = JSON.parse(result.contents[0].text);
		expect(parsed.version).toBe("1");
		expect(parsed.entries).toEqual([
			{ id: "glsl-top", kind: "operator", title: "GLSL TOP" },
		]);
	});

	it("td://operators/{id} should return enriched entry from fusionService", async () => {
		setupWithEntries([makeOperatorEntry()]);

		const fusionResult = {
			_meta: { source: "static" as const } satisfies EnrichmentMeta,
			entry: makeOperatorEntry() as unknown as EnrichedOperatorEntry,
		};
		mockFusionService.getEntry.mockResolvedValue(fusionResult);

		const templateCall = mockServer.registeredResources[1];
		const uri = new URL("td://operators/glsl-top");
		const variables = { id: "glsl-top" };
		const result = (await templateCall.callback(uri, variables)) as {
			contents: Array<{ uri: string; text: string; mimeType: string }>;
		};

		expect(result.contents).toHaveLength(1);
		const parsed = JSON.parse(result.contents[0].text);
		expect(parsed.version).toBe("1");
		expect(parsed.entry.id).toBe("glsl-top");
		expect(parsed._meta.source).toBe("static");
	});

	it("td://operators/{id} should throw McpError for unknown operator", async () => {
		setupWithEntries([makeOperatorEntry()]);
		mockFusionService.getEntry.mockResolvedValue(undefined);

		const templateCall = mockServer.registeredResources[1];
		const uri = new URL("td://operators/nonexistent");
		const variables = { id: "nonexistent" };

		await expect(templateCall.callback(uri, variables)).rejects.toThrow(
			/Operator "nonexistent" not found/,
		);
	});

	it("template list callback should enumerate all operators", async () => {
		setupWithEntries([
			makeOperatorEntry(),
			makeOperatorEntry({ id: "noise-top", title: "Noise TOP" }),
		]);

		const templateCall = mockServer.registeredResources[1];
		const template = templateCall.uriOrTemplate as {
			listCallback?: () => Promise<unknown>;
		};
		if (template.listCallback) {
			const listResult = (await template.listCallback()) as {
				resources: Array<{
					uri: string;
					name: string;
					mimeType: string;
				}>;
			};
			expect(listResult.resources).toHaveLength(2);
			expect(listResult.resources[0].uri).toBe("td://operators/glsl-top");
		}
	});
});
