import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ILogger } from "../core/logger.js";
import { McpLogger } from "../core/logger.js";
import type { Result } from "../core/result.js";
import type { ServerModeValue } from "../core/serverMode.js";
import { ServerMode } from "../core/serverMode.js";
import { MCP_SERVER_VERSION } from "../core/version.js";
import { registerPrompts } from "../features/prompts/index.js";
import { registerResources } from "../features/resources/index.js";
import { registerTools } from "../features/tools/index.js";
import { createTouchDesignerClient } from "../tdClient/index.js";
import type { TouchDesignerClient } from "../tdClient/touchDesignerClient.js";
import { ConnectionManager } from "./connectionManager.js";

/**
 * Capabilities supported by TouchDesigner MCP Server
 */
export interface TouchDesignerCapabilities {
	logging: Record<string, never>;
	prompts: Record<string, never>;
	resources: Record<string, never>;
	tools: Record<string, never>;
}

/**
 * TouchDesigner MCP Server implementation
 */
export class TouchDesignerServer {
	readonly server: McpServer;
	readonly logger: ILogger;
	readonly tdClient: TouchDesignerClient;
	readonly serverMode: ServerMode;
	private readonly connectionManager: ConnectionManager;

	/**
	 * Initialize TouchDesignerServer with proper dependency injection
	 */
	constructor() {
		this.server = new McpServer(
			{
				name: "TouchDesigner",
				version: MCP_SERVER_VERSION,
			},
			{
				capabilities: {
					logging: {},
					prompts: {},
					tools: {},
				},
			},
		);
		this.logger = new McpLogger(this.server);
		this.serverMode = new ServerMode();

		this.tdClient = createTouchDesignerClient({
			logger: this.logger,
			serverMode: this.serverMode,
		});

		this.connectionManager = new ConnectionManager(this.server, this.logger);

		const stats = this.registerAllFeatures();

		// Log mode transitions to stderr
		this.serverMode.on("modeChanged", (mode: ServerModeValue) => {
			if (mode === "live") {
				console.error(
					`[TD-MCP] TouchDesigner connected (build ${this.serverMode.tdBuild ?? "unknown"}) — live tools enabled`,
				);
			} else {
				console.error("[TD-MCP] TouchDesigner disconnected — docs-only mode");
			}
		});

		// Non-blocking startup probe: detect TD immediately if available,
		// otherwise stay in docs-only mode with zero delay.
		void this.tdClient
			.healthProbe(2000)
			.then((health) => {
				if (health.online) {
					console.error(
						`[TD-MCP] TouchDesigner detected (build ${health.build ?? "unknown"})`,
					);
				} else {
					this.logDocsOnlyBanner(stats);
				}
			})
			.catch(() => {
				this.logDocsOnlyBanner(stats);
			});
	}

	/**
	 * Create a new TouchDesignerServer instance
	 *
	 * Factory method for creating server instances in multi-session scenarios.
	 * Each session should have its own server instance to maintain independent MCP protocol state.
	 *
	 * @returns McpServer instance ready for connection to a transport
	 *
	 * @example
	 * ```typescript
	 * // In TransportRegistry
	 * const serverFactory = () => TouchDesignerServer.create();
	 * const transport = await registry.getOrCreate(sessionId, body, serverFactory);
	 * ```
	 */
	static create(): McpServer {
		const instance = new TouchDesignerServer();
		return instance.server;
	}

	/**
	 * Connect to MCP transport
	 */
	async connect(transport: Transport): Promise<Result<void, Error>> {
		return this.connectionManager.connect(transport);
	}

	/**
	 * Disconnect from MCP transport
	 */
	async disconnect(): Promise<Result<void, Error>> {
		return this.connectionManager.disconnect();
	}

	/**
	 * Check if connected to MCP transport
	 */
	isConnectedToMCP(): boolean {
		return this.connectionManager.isConnected();
	}

	/**
	 * Register all features with the server
	 * Only called after all dependencies are initialized
	 */
	private registerAllFeatures(): { assets: number; knowledge: number } {
		registerPrompts(this.server, this.logger);
		const { fusionService, registry, versionManifest } = registerResources(
			this.server,
			this.logger,
			this.tdClient,
			this.serverMode,
		);
		const { assetRegistry } = registerTools(
			this.server,
			this.logger,
			this.tdClient,
			this.serverMode,
			registry,
			{ fusionService, versionManifest },
		);
		return {
			assets: assetRegistry.size,
			knowledge: registry.size,
		};
	}

	private logDocsOnlyBanner(stats: {
		assets: number;
		knowledge: number;
	}): void {
		const port = process.env.TD_WEB_SERVER_PORT ?? "9981";
		console.error("[TD-MCP] Started in docs-only mode");
		console.error(
			`[TD-MCP] ${stats.knowledge} knowledge entries, ${stats.assets} assets loaded`,
		);
		console.error(
			`[TD-MCP] Connect TouchDesigner to enable live tools (port ${port})`,
		);
	}
}
