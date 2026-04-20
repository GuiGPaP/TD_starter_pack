import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import type { TDVersionInfo } from "../../../src/features/resources/versionManifest.js";
import { registerVersionTools } from "../../../src/features/tools/handlers/versionTools.js";

// --- Helpers ---

const MOCK_VERSIONS: TDVersionInfo[] = [
	{
		breakingChanges: ["Python 3.9 → 3.11"],
		highlights: ["Python 3.11 upgrade", "OAK-D cameras"],
		id: "2023",
		label: "TouchDesigner 2023",
		newOperators: ["oakDeviceCHOP", "oakSelectCHOP"],
		pythonVersion: "3.11",
		releaseYear: 2023,
		supportStatus: "maintenance",
	},
	{
		breakingChanges: [],
		highlights: ["POP family preview"],
		id: "2024",
		label: "TouchDesigner 2024",
		newOperators: ["glslPOP"],
		pythonVersion: "3.11",
		releaseYear: 2024,
		supportStatus: "active",
	},
	{
		breakingChanges: ["Polygonize POP 3D only"],
		highlights: ["Full POP family", "HDR support"],
		id: "2025",
		label: "TouchDesigner 2025",
		newOperators: ["textPOP", "tracePOP", "layerMixTOP"],
		pythonVersion: "3.11",
		releaseYear: 2025,
		supportStatus: "current",
	},
];

type ToolCall = {
	name: string;
	description: string;
	schema: unknown;
	handler: (params?: Record<string, unknown>) => Promise<unknown>;
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

function createMockVersionManifest(versions: TDVersionInfo[] = MOCK_VERSIONS) {
	return {
		getAllVersions: vi.fn(() => [...versions]),
		getVersion: vi.fn((id: string) => versions.find((v) => v.id === id)),
	};
}

function getRegisteredHandler(tools: ToolCall[], toolName: string) {
	const tool = tools.find((candidate) => candidate.name === toolName);
	if (!tool) throw new Error(`Expected tool to be registered: ${toolName}`);
	return tool.handler;
}

const mockLogger = {
	sendLog: vi.fn(),
};

// --- Tests ---

describe("versionTools", () => {
	let tools: ToolCall[];

	beforeEach(() => {
		const { server, tools: t } = createMockServer();
		tools = t;
		const manifest = createMockVersionManifest();
		registerVersionTools(
			server as never,
			mockLogger as never,
			manifest as never,
		);
	});

	it("should register list_versions and get_version_info tools", () => {
		const names = tools.map((t) => t.name);
		expect(names).toContain(TOOL_NAMES.LIST_VERSIONS);
		expect(names).toContain(TOOL_NAMES.GET_VERSION_INFO);
	});

	describe("list_versions", () => {
		function getHandler() {
			return getRegisteredHandler(tools, TOOL_NAMES.LIST_VERSIONS);
		}

		it("should return all versions", async () => {
			const result = (await getHandler()()) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("2023");
			expect(result.content[0].text).toContain("2024");
			expect(result.content[0].text).toContain("2025");
		});

		it("should filter by status", async () => {
			const result = (await getHandler()({ status: "current" })) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("2025");
			expect(result.content[0].text).not.toContain("2023");
		});
	});

	describe("get_version_info", () => {
		function getHandler() {
			return getRegisteredHandler(tools, TOOL_NAMES.GET_VERSION_INFO);
		}

		it("should return version detail", async () => {
			const result = (await getHandler()({ id: "2025" })) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("2025");
			expect(result.content[0].text).toContain("3.11");
		});

		it("should return error for unknown version", async () => {
			const result = (await getHandler()({ id: "1999" })) as {
				content: { text: string }[];
				isError: boolean;
			};
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("not found");
		});
	});
});
