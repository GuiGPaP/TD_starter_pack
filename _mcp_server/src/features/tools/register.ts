import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ILogger } from "../../core/logger.js";
import type { ServerMode } from "../../core/serverMode.js";
import type { TouchDesignerClient } from "../../tdClient/index.js";
import type { FusionService } from "../resources/fusionService.js";
import { resolveKnowledgePath } from "../resources/paths.js";
import type { KnowledgeRegistry } from "../resources/registry.js";
import type { VersionManifest } from "../resources/versionManifest.js";
import {
	resolveBuiltinAssetsPath,
	resolveProjectAssetsPath,
	resolveUserAssetsPath,
} from "../templates/paths.js";
import { AssetRegistry } from "../templates/registry.js";
import type { AssetSource } from "../templates/types.js";
import { registerAssetTools } from "./handlers/assetTools.js";
import { registerBuildTools } from "./handlers/buildTools.js";
import { registerExecLogTools } from "./handlers/execLogTools.js";
import { registerGlslPatternTools } from "./handlers/glslPatternTools.js";
import { registerHealthTools } from "./handlers/healthTools.js";
import { registerLessonTools } from "./handlers/lessonTools.js";
import { registerNetworkTemplateTools } from "./handlers/networkTemplateTools.js";
import { registerPaletteTools } from "./handlers/paletteTools.js";
import { registerPerfTools } from "./handlers/perfTools.js";
import { registerProjectCatalogTools } from "./handlers/projectCatalogTools.js";
import { registerScreenshotTools } from "./handlers/screenshotTools.js";
import { registerSearchTools } from "./handlers/searchTools.js";
import { registerTdTools } from "./handlers/tdTools.js";
import { registerTechniqueTools } from "./handlers/techniqueTools.js";
import { registerToolkitTools } from "./handlers/toolkitTools.js";
import { registerTutorialTools } from "./handlers/tutorialTools.js";
import { registerVersionTools } from "./handlers/versionTools.js";
import { registerWorkflowTools } from "./handlers/workflowTools.js";
import { ExecAuditLog } from "./security/index.js";

export interface ResourceDeps {
	fusionService: FusionService;
	versionManifest: VersionManifest;
}

/**
 * Register tool handlers with MCP server
 */
export function registerTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
	knowledgeRegistry: KnowledgeRegistry,
	resourceDeps?: ResourceDeps,
): { assetRegistry: AssetRegistry } {
	const auditLog = new ExecAuditLog();
	registerTdTools(server, logger, tdClient, serverMode, auditLog);
	registerHealthTools(server, logger, tdClient, serverMode);
	registerPerfTools(server, logger, tdClient, serverMode);
	registerExecLogTools(server, logger, auditLog);
	registerScreenshotTools(server, logger, tdClient, serverMode);

	// Initialize asset registry with discovered paths
	const assetRegistry = new AssetRegistry(logger);
	const assetPaths: Array<{ path: string; source: AssetSource }> = [];

	const builtinPath = resolveBuiltinAssetsPath(import.meta.url);
	if (builtinPath) {
		assetPaths.push({ path: builtinPath, source: "builtin" });
	}

	const userPath = resolveUserAssetsPath();
	if (userPath) {
		assetPaths.push({ path: userPath, source: "user" });
	}

	const projectPath = resolveProjectAssetsPath();
	if (projectPath) {
		assetPaths.push({ path: projectPath, source: "project" });
	}

	assetRegistry.loadAll(assetPaths);

	registerAssetTools(server, logger, tdClient, assetRegistry, serverMode);
	registerGlslPatternTools(
		server,
		logger,
		tdClient,
		knowledgeRegistry,
		serverMode,
	);

	// Register search/compare tools if resource dependencies available
	if (resourceDeps) {
		registerSearchTools(
			server,
			logger,
			knowledgeRegistry,
			resourceDeps.versionManifest,
			resourceDeps.fusionService,
			serverMode,
		);

		// Register version history tools (offline)
		registerVersionTools(server, logger, resourceDeps.versionManifest);
	}

	// Register lesson tools (offline, no TD needed)
	const knowledgePath = resolveKnowledgePath(import.meta.url);
	registerLessonTools(
		server,
		logger,
		knowledgeRegistry,
		serverMode,
		knowledgePath,
		tdClient,
	);

	// Register technique tools (offline)
	registerTechniqueTools(server, logger, knowledgeRegistry, serverMode);

	// Register tutorial tools (offline)
	registerTutorialTools(server, logger, knowledgeRegistry, serverMode);

	// Register toolkit tools (search/get offline, detect live)
	registerToolkitTools(server, logger, knowledgeRegistry, serverMode, tdClient);

	// Register workflow tools (offline, no TD needed)
	registerWorkflowTools(
		server,
		logger,
		knowledgeRegistry,
		serverMode,
		knowledgePath,
	);

	// Register network template tools (search/get offline, deploy live)
	registerNetworkTemplateTools(
		server,
		logger,
		knowledgeRegistry,
		serverMode,
		tdClient,
	);

	// Register build tracking tools (offline)
	if (knowledgePath) {
		registerBuildTools(
			server,
			logger,
			knowledgePath.replace(/[/\\]td-knowledge$/, ""),
		);
	}

	// Register project catalog tools
	registerProjectCatalogTools(server, logger, tdClient, serverMode, auditLog);

	// Register palette tools (index, search, load)
	registerPaletteTools(server, logger, tdClient, serverMode, auditLog);

	return { assetRegistry };
}
