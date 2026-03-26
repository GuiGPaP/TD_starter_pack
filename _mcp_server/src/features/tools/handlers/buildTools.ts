import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import { formatBuildDetail, formatBuildList } from "../presenter/index.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Types ---

interface BuildFeature {
	area: string;
	description: string;
}

interface ExperimentalBuild {
	breakingChanges: string[];
	features: BuildFeature[];
	graduatedTo: string | null;
	latestBuild: string;
	newOperators: string[];
	pythonApiAdditions: string[];
	releaseDate: string;
	series: string;
	status: string;
}

// --- Data loader ---

let cachedBuilds: ExperimentalBuild[] | null = null;

function loadBuilds(dataPath: string, logger: ILogger): ExperimentalBuild[] {
	if (cachedBuilds) return cachedBuilds;

	const filePath = join(dataPath, "td-builds", "experimental-builds.json");
	if (!existsSync(filePath)) {
		logger.sendLog({
			data: `Experimental builds file not found: ${filePath}`,
			level: "warning",
		});
		return [];
	}

	try {
		const raw = readFileSync(filePath, "utf-8");
		cachedBuilds = JSON.parse(raw) as ExperimentalBuild[];
		return cachedBuilds;
	} catch (error) {
		logger.sendLog({
			data: `Failed to load experimental builds: ${error}`,
			level: "warning",
		});
		return [];
	}
}

// --- Schemas ---

const listBuildsSchema = detailOnlyFormattingSchema.extend({
	area: z
		.string()
		.describe(
			"Filter by feature area (e.g., rendering, operators, python, networking, ui)",
		)
		.optional(),
	status: z
		.enum(["active", "graduated"])
		.describe("Filter by build status")
		.optional(),
});
type ListBuildsParams = z.input<typeof listBuildsSchema>;

const getBuildSchema = detailOnlyFormattingSchema.extend({
	series: z
		.string()
		.min(1)
		.describe("Build series identifier (e.g., 2025.30000)"),
});
type GetBuildParams = z.input<typeof getBuildSchema>;

// --- Registration ---

export function registerBuildTools(
	server: McpServer,
	logger: ILogger,
	dataPath: string,
): void {
	server.tool(
		TOOL_NAMES.LIST_EXPERIMENTAL_BUILDS,
		"List TouchDesigner experimental build series, optionally filtered by feature area or status (offline)",
		listBuildsSchema.strict().shape,
		async (params: ListBuildsParams) => {
			try {
				let builds = loadBuilds(dataPath, logger);

				if (params.status) {
					builds = builds.filter((b) => b.status === params.status);
				}
				if (params.area) {
					const area = params.area.toLowerCase();
					builds = builds.filter((b) =>
						b.features.some((f) => f.area.toLowerCase().includes(area)),
					);
				}

				const text = formatBuildList(builds, {
					area: params.area,
					detailLevel: params.detailLevel ?? "summary",
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.LIST_EXPERIMENTAL_BUILDS,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.GET_EXPERIMENTAL_BUILD,
		"Get details of a specific TouchDesigner experimental build series (offline)",
		getBuildSchema.strict().shape,
		async (params: GetBuildParams) => {
			try {
				const builds = loadBuilds(dataPath, logger);
				const build = builds.find((b) => b.series === params.series);

				if (!build) {
					const available = builds.map((b) => b.series).join(", ");
					return {
						content: [
							{
								text: `Build series '${params.series}' not found. Available: ${available || "(none)"}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const text = formatBuildDetail(build, {
					detailLevel: params.detailLevel ?? "summary",
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.GET_EXPERIMENTAL_BUILD,
				);
			}
		},
	);
}
