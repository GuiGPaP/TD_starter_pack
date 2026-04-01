import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { VersionManifest } from "../../resources/versionManifest.js";
import { formatVersionDetail, formatVersionList } from "../presenter/index.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const listVersionsSchema = detailOnlyFormattingSchema.extend({
	status: z
		.enum(["active", "current", "legacy", "maintenance"])
		.describe("Filter by support status")
		.optional(),
});
type ListVersionsParams = z.input<typeof listVersionsSchema>;

const getVersionInfoSchema = detailOnlyFormattingSchema.extend({
	id: z
		.string()
		.min(1)
		.describe("Version ID to retrieve (e.g., '2024', '2023')"),
});
type GetVersionInfoParams = z.input<typeof getVersionInfoSchema>;

// --- Registration ---

export function registerVersionTools(
	server: McpServer,
	logger: ILogger,
	versionManifest: VersionManifest,
): void {
	// list_versions
	server.tool(
		TOOL_NAMES.LIST_VERSIONS,
		"List all TouchDesigner versions with Python version, support status, and highlights (offline)",
		listVersionsSchema.strict().shape,
		async (params: ListVersionsParams = {}) => {
			try {
				let versions = versionManifest.getAllVersions();

				if (params.status) {
					versions = versions.filter((v) => v.supportStatus === params.status);
				}

				const text = formatVersionList(versions, {
					detailLevel: params.detailLevel ?? "summary",
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.LIST_VERSIONS);
			}
		},
	);

	// get_version_info
	server.tool(
		TOOL_NAMES.GET_VERSION_INFO,
		"Get detailed information about a specific TouchDesigner version: Python version, new operators, breaking changes, highlights (offline)",
		getVersionInfoSchema.strict().shape,
		async (params: GetVersionInfoParams) => {
			try {
				const version = versionManifest.getVersion(params.id);

				if (!version) {
					const allIds = versionManifest
						.getAllVersions()
						.map((v) => v.id)
						.join(", ");
					return {
						content: [
							{
								text: `Version '${params.id}' not found. Available: ${allIds || "(none)"}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const text = formatVersionDetail(version, {
					detailLevel: params.detailLevel ?? "summary",
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.GET_VERSION_INFO);
			}
		},
	);
}
