import type { ToolNames } from "../features/tools/index.js";
import type { ILogger } from "./logger.js";
import type { ServerMode } from "./serverMode.js";

/**
 * Standard API error response structure compatible with MCP SDK
 */
interface ErrorResponse {
	[key: string]: unknown;
	isError: true;
	content: Array<{
		type: "text";
		text: string;
	}>;
}

/**
 * Handles API errors consistently across the application
 */
export function handleToolError(
	error: unknown,
	logger: ILogger,
	toolName: ToolNames,
	referenceComment?: string,
	serverMode?: ServerMode,
): ErrorResponse {
	const formattedError =
		error instanceof Error
			? error
			: new Error(error === null ? "Null error received" : String(error));

	const logData: Record<string, unknown> = {
		error: formattedError.message,
		message: "Tool execution failed",
		toolName,
	};

	if (referenceComment) {
		logData.referenceComment = referenceComment;
	}

	if (formattedError.stack) {
		logData.stack = formattedError.stack;
	}

	logger.sendLog({
		data: logData,
		level: "error",
		logger: "ErrorHandling",
	});

	let errorMessage = `${toolName}: ${formattedError}${referenceComment ? `. ${referenceComment}` : ""}`;

	if (serverMode?.mode === "docs-only") {
		errorMessage +=
			"\n\n💡 Mode: docs-only — static resources (td://modules, td://operators) are available offline.";
	}

	return {
		content: [
			{
				text: errorMessage,
				type: "text" as const,
			},
		],
		isError: true,
	};
}
