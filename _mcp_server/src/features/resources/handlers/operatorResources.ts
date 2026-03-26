import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { RESOURCE_URIS } from "../../../core/constants.js";
import type { ILogger } from "../../../core/logger.js";
import type { FusionService } from "../fusionService.js";
import type { KnowledgeRegistry } from "../registry.js";

/**
 * Register MCP resources for TD operator entries.
 *
 * - td://operators — static index of all operator entries
 * - td://operators/{id} — detail for a single operator (enriched with live data when available)
 */
export function registerOperatorResources(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	fusionService: FusionService,
): void {
	// Static resource: operator index
	server.registerResource(
		"TD Operator Index",
		RESOURCE_URIS.OPERATORS_INDEX,
		{ mimeType: "application/json" },
		() => {
			const index = registry.getOperatorIndex();
			return {
				contents: [
					{
						mimeType: "application/json",
						text: JSON.stringify({ entries: index, version: "1" }),
						uri: RESOURCE_URIS.OPERATORS_INDEX,
					},
				],
			};
		},
	);

	// Template resource: operator detail (async — may call live TD)
	const operatorTemplate = new ResourceTemplate(RESOURCE_URIS.OPERATOR_DETAIL, {
		list: async () => ({
			resources: registry.getOperatorIndex().map((e) => ({
				mimeType: "application/json",
				name: e.title,
				uri: `td://operators/${e.id}`,
			})),
		}),
	});

	server.registerResource(
		"TD Operator Detail",
		operatorTemplate,
		{
			description:
				"Detailed documentation for a TD operator, enriched with live parameter data when TD is connected",
			mimeType: "application/json",
		},
		async (uri, variables) => {
			const id = variables.id as string;
			const result = await fusionService.getEntry(id);
			if (!result) {
				throw new McpError(
					ErrorCode.InvalidParams,
					`Operator "${id}" not found`,
				);
			}
			return {
				contents: [
					{
						mimeType: "application/json",
						text: JSON.stringify({
							_meta: result._meta,
							entry: result.entry,
							version: "1",
						}),
						uri: uri.href,
					},
				],
			};
		},
	);

	logger.sendLog({
		data: `Registered operator resources: ${RESOURCE_URIS.OPERATORS_INDEX}, ${RESOURCE_URIS.OPERATOR_DETAIL}`,
		level: "info",
		logger: "registerOperatorResources",
	});
}
