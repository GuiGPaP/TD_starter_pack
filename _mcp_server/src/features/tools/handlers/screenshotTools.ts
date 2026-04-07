import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import { withLiveGuard } from "../toolGuards.js";

const screenshotSchema = z.object({
	format: z
		.enum(["png", "jpg"])
		.optional()
		.describe("Image format (default: png)"),
	path: z.string().describe("Operator path (e.g. /render1)"),
});

type ScreenshotParams = z.input<typeof screenshotSchema>;

interface ScreenshotSuccess {
	base64: string;
	format: string;
	height: number;
	path: string;
	width: number;
}

interface ScreenshotError {
	error: string;
}

type ScreenshotResult = ScreenshotSuccess | ScreenshotError;

function buildScreenshotScript(opPath: string, format: string): string {
	return `
import base64
target = op('${opPath}')
if target is None:
    result = {"error": "Operator not found: ${opPath}"}
elif not hasattr(target, 'saveByteArray'):
    result = {"error": f"Operator {target.path} ({target.family}) has no visual output — only TOPs can be screenshotted"}
else:
    try:
        raw = target.saveByteArray('.${format}')
        b64 = base64.b64encode(raw).decode('ascii')
        result = {"base64": b64, "width": target.width, "height": target.height, "format": "${format}", "path": target.path}
    except Exception as e:
        result = {"error": f"Screenshot failed: {e}"}
`.trim();
}

export function registerScreenshotTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
): void {
	server.tool(
		TOOL_NAMES.SCREENSHOT_OPERATOR,
		"Capture a screenshot of a TOP operator's visual output and return it as an inline image. Only works with TOP-family operators (render, composite, filter, etc.).",
		screenshotSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.SCREENSHOT_OPERATOR,
			serverMode,
			tdClient,
			async (params: ScreenshotParams) => {
				const { format = "png", path: opPath } = params;
				const mimeType = format === "jpg" ? "image/jpeg" : "image/png";

				try {
					const script = buildScreenshotScript(opPath, format);
					const scriptResult = await tdClient.execPythonScript<{
						result: ScreenshotResult;
					}>({ mode: "read-only", script });

					if (!scriptResult.success) {
						throw scriptResult.error;
					}

					const data =
						typeof scriptResult.data.result === "string"
							? (JSON.parse(scriptResult.data.result) as ScreenshotResult)
							: scriptResult.data.result;

					if ("error" in data) {
						return {
							content: [{ text: data.error, type: "text" as const }],
							isError: true,
						};
					}

					return {
						content: [
							{
								data: data.base64,
								mimeType,
								type: "image" as const,
							},
							{
								text: `Screenshot of ${data.path} (${data.width}×${data.height}, ${format})`,
								type: "text" as const,
							},
						],
					};
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.SCREENSHOT_OPERATOR,
						undefined,
						serverMode,
					);
				}
			},
		),
	);
}
