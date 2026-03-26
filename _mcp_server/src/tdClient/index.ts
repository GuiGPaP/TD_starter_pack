import type { ILogger } from "../core/logger.js";
import type { ServerMode } from "../core/serverMode.js";
import { TouchDesignerClient } from "./touchDesignerClient.js";

export interface CreateTouchDesignerClientParams {
	logger: ILogger;
	serverMode?: ServerMode;
}

export function createTouchDesignerClient(
	params: CreateTouchDesignerClientParams,
) {
	const { logger, serverMode } = params;

	return new TouchDesignerClient({ logger, serverMode });
}

export { TouchDesignerClient } from "./touchDesignerClient.js";
