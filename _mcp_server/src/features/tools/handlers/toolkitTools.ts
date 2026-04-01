import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDToolkitEntry } from "../../resources/types.js";
import {
	type DetectedToolkit,
	formatDetectResult,
	formatToolkitDetail,
	formatToolkitSearchResults,
} from "../presenter/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchToolkitsSchema = detailOnlyFormattingSchema.extend({
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.describe("Maximum number of results (default: 10)")
		.optional(),
	query: z
		.string()
		.describe("Search query — matches against name, vendor, summary")
		.optional(),
});
type SearchToolkitsParams = z.input<typeof searchToolkitsSchema>;

const getToolkitSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Toolkit ID to retrieve (e.g. t3d-toolkit)"),
});
type GetToolkitParams = z.input<typeof getToolkitSchema>;

const detectToolkitsSchema = detailOnlyFormattingSchema.extend({
	rootPath: z
		.string()
		.describe("Root operator path to check (default: /project1)")
		.optional(),
});
type DetectToolkitsParams = z.input<typeof detectToolkitsSchema>;

// --- Local text matching ---

function matchesQuery(entry: TDToolkitEntry, query: string): boolean {
	const q = query.toLowerCase();
	const haystacks = [
		entry.id,
		entry.title,
		entry.content.summary,
		...(entry.aliases ?? []),
		...entry.searchKeywords,
		entry.payload.name,
		entry.payload.vendor,
		entry.payload.opFamilyPrefix,
	];
	if (entry.payload.version) haystacks.push(entry.payload.version);
	return haystacks.some((h) => h.toLowerCase().includes(q));
}

// --- Detection script generator ---

function generateDetectScript(
	toolkits: TDToolkitEntry[],
	rootPath: string,
): string {
	const checks = toolkits
		.filter(
			(t) => t.payload.detectionPaths && t.payload.detectionPaths.length > 0,
		)
		.map((t) => {
			const paths = t.payload.detectionPaths?.map((p) => {
				// Replace /project1 with the user-specified root if different
				if (rootPath !== "/project1" && p.startsWith("/project1")) {
					return p.replace("/project1", rootPath);
				}
				return p;
			});
			return { id: t.id, name: t.payload.name, paths };
		});

	return `
import json

results = []
checks = ${JSON.stringify(checks)}

for check in checks:
    detected = False
    found_path = ""
    for p in check["paths"]:
        try:
            node = op(p)
            if node is not None:
                detected = True
                found_path = p
                break
        except Exception:
            pass
    results.append({
        "toolkitId": check["id"],
        "toolkitName": check["name"],
        "detected": detected,
        "path": found_path if detected else check["paths"][0]
    })

result = results
`;
}

// --- Registration ---

export function registerToolkitTools(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	serverMode: ServerMode,
	tdClient: TouchDesignerClient,
): void {
	server.tool(
		TOOL_NAMES.SEARCH_TOOLKITS,
		"Search third-party toolkits (T3D, LOPs, POPx) registered in the knowledge base. Offline — no TD connection needed.",
		searchToolkitsSchema.strict().shape,
		async (params: SearchToolkitsParams = {}) => {
			try {
				const { detailLevel, maxResults, query, responseFormat } = params;
				const limit = maxResults ?? 10;

				let results = registry.getByKind("toolkit") as TDToolkitEntry[];

				if (query) {
					results = results.filter((e) => matchesQuery(e, query));
				}

				results = results.slice(0, limit);

				const text = formatToolkitSearchResults(results, {
					detailLevel: detailLevel ?? "summary",
					query,
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_TOOLKITS,
					undefined,
					serverMode,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.GET_TOOLKIT,
		"Get detailed information about a specific third-party toolkit by ID (offline, no TD connection needed).",
		getToolkitSchema.strict().shape,
		async (params: GetToolkitParams) => {
			try {
				const { detailLevel, id, responseFormat } = params;
				const entry = registry.getById(id);
				if (!entry || entry.kind !== "toolkit") {
					return {
						content: [
							{
								text: `Toolkit not found: "${id}". Use search_toolkits to discover available toolkits.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
				const text = formatToolkitDetail(entry as TDToolkitEntry, {
					detailLevel: detailLevel ?? "detailed",
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.GET_TOOLKIT,
					undefined,
					serverMode,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.DETECT_TOOLKITS,
		"Detect which third-party toolkits are installed in the current TD project by probing known paths. Requires live TD connection.",
		detectToolkitsSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.DETECT_TOOLKITS,
			serverMode,
			tdClient,
			async (params: DetectToolkitsParams) => {
				try {
					const rootPath = params.rootPath ?? "/project1";

					const toolkits = registry.getByKind("toolkit") as TDToolkitEntry[];
					if (toolkits.length === 0) {
						return {
							content: [
								{
									text: "No toolkits registered in the knowledge base.",
									type: "text" as const,
								},
							],
						};
					}

					const script = generateDetectScript(toolkits, rootPath);
					const scriptResult = await tdClient.execPythonScript<{
						result: DetectedToolkit[];
					}>({ mode: "read-only", script });

					if (!scriptResult.success) {
						return {
							content: [
								{
									text: `Detection failed: ${scriptResult.error}`,
									type: "text" as const,
								},
							],
							isError: true,
						};
					}

					const detected = scriptResult.data?.result ?? [];
					const text = formatDetectResult(detected);
					return { content: [{ text, type: "text" as const }] };
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.DETECT_TOOLKITS,
						undefined,
						serverMode,
					);
				}
			},
		),
	);
}
