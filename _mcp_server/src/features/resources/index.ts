import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ILogger } from "../../core/logger.js";
import type { ServerMode } from "../../core/serverMode.js";
import type { TouchDesignerClient } from "../../tdClient/touchDesignerClient.js";
import { FusionService } from "./fusionService.js";
import { registerKnowledgeResources } from "./handlers/knowledgeResources.js";
import { registerOperatorResources } from "./handlers/operatorResources.js";
import { loadRuntimeOperatorEntries } from "./operatorRuntimeCache.js";
import { resolveKnowledgePath } from "./paths.js";
import { KnowledgeRegistry } from "./registry.js";
import { VersionManifest } from "./versionManifest.js";

export interface ResourceServices {
	fusionService: FusionService;
	registry: KnowledgeRegistry;
	versionManifest: VersionManifest;
}

export function registerResources(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
): ResourceServices {
	const registry = new KnowledgeRegistry(logger);
	const path = resolveKnowledgePath(import.meta.url);
	if (path) {
		registry.loadAll(path);
	} else {
		logger.sendLog({
			data: "Knowledge base path not found — resources will be empty. Check TD_MCP_KNOWLEDGE_PATH or verify data/td-knowledge/ exists.",
			level: "warning",
			logger: "registerResources",
		});
	}

	const runtimeOperators = loadRuntimeOperatorEntries(
		serverMode.tdBuild,
		logger,
	);
	for (const entry of runtimeOperators) {
		registry.upsertEntry(entry);
	}
	if (runtimeOperators.length > 0) {
		logger.sendLog({
			data: `Loaded runtime operator catalogue: ${runtimeOperators.length} operator(s)`,
			level: "info",
			logger: "registerResources",
		});
	}

	const fusionService = new FusionService(
		registry,
		tdClient,
		serverMode,
		logger,
	);

	const versionManifest = new VersionManifest(logger);
	versionManifest.loadFromKnowledgePath(import.meta.url);

	registerKnowledgeResources(server, logger, registry);
	registerOperatorResources(server, logger, registry, fusionService);

	return { fusionService, registry, versionManifest };
}
