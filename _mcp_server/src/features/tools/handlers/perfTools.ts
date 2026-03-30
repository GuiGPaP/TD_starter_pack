import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import { withLiveGuard } from "../toolGuards.js";

/**
 * Python script that collects global + per-operator performance data in TD.
 * Returns JSON-serializable dict.
 *
 * Accepts `scope` (path to scan children of) and `top_n` (max ops to return).
 * Uses per-frame cook metrics (cookedThisFrame, cookStartTime, cookEndTime)
 * rather than cumulative cpuCookTime for accurate per-frame cost.
 */
const PERF_SCRIPT = `
import json

scope = '__SCOPE__'
top_n = __TOP_N__
include_global = __INCLUDE_GLOBAL__

result_data = {}

# --- Global performance (from project + Perform CHOP if available) ---
if include_global:
    result_data['global'] = {
        'cookRate': project.cookRate,
        'realTime': project.realTime,
    }
    # Find any performCHOP in the project for real-time metrics
    for comp_path in ['/', '/TDDocker', '/TDDocker/containers/sllidar']:
        c = op(comp_path)
        if not c:
            continue
        for child in c.findChildren(type=performCHOP, depth=1):
            chans = {}
            for ch in child.chans():
                chans[ch.name] = round(ch[0], 3)
            result_data['global']['performCHOP'] = {
                'path': child.path,
                'channels': chans,
            }
            break
        if 'performCHOP' in result_data.get('global', {}):
            break

# --- Per-operator profiling ---
scan_root = op(scope)
if scan_root:
    ops_data = []
    children = scan_root.findChildren(depth=1) if scan_root.isCOMP else []

    for o in children:
        entry = {
            'path': o.path,
            'name': o.name,
            'type': o.OPType,
            'cpuCookTime': round(o.cpuCookTime * 1000, 3),
            'gpuCookTime': round(o.gpuCookTime * 1000, 3) if hasattr(o, 'gpuCookTime') and o.gpuCookTime else 0,
            'cookedThisFrame': o.cookedThisFrame,
            'cookedPreviousFrame': o.cookedPreviousFrame,
            'cookStartTime': round(o.cookStartTime * 1000, 3) if o.cookStartTime else 0,
            'cookEndTime': round(o.cookEndTime * 1000, 3) if o.cookEndTime else 0,
            'totalCooks': o.totalCooks,
            'cpuMemory': o.cpuMemory,
            'gpuMemory': o.gpuMemory if hasattr(o, 'gpuMemory') else 0,
        }
        # Per-frame cost = endTime - startTime (if cooked this frame)
        if o.cookedThisFrame and o.cookStartTime and o.cookEndTime:
            entry['frameCostMs'] = round((o.cookEndTime - o.cookStartTime) * 1000, 3)
        else:
            entry['frameCostMs'] = 0

        # COMP children aggregate
        if o.isCOMP:
            entry['childrenCPUCookTime'] = round(o.childrenCPUCookTime * 1000, 3)

        ops_data.append(entry)

    # Sort by frame cost (current frame), fallback to cumulative
    ops_data.sort(key=lambda x: (x['frameCostMs'], x['cpuCookTime']), reverse=True)
    result_data['operators'] = ops_data[:top_n]
    result_data['totalScanned'] = len(children)

result = json.dumps(result_data)
`;

function buildPerfScript(
	scope: string,
	topN: number,
	includeGlobal: boolean,
): string {
	return PERF_SCRIPT.replace("__SCOPE__", scope)
		.replace("__TOP_N__", String(topN))
		.replace("__INCLUDE_GLOBAL__", includeGlobal ? "True" : "False");
}

const getPerformanceSchema = {
	scope: z
		.string()
		.describe(
			"Path to scan for operator performance (e.g., '/TDDocker', '/TDDocker/containers/sllidar'). Scans direct children.",
		)
		.optional(),
	topN: z
		.number()
		.int()
		.min(1)
		.max(100)
		.describe("Max number of operators to return, sorted by cost (default: 20)")
		.optional(),
	includeGlobal: z
		.boolean()
		.describe(
			"Include global performance metrics (FPS, cook rate, Perform CHOP data). Default: true",
		)
		.optional(),
};

export function registerPerfTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
): void {
	server.tool(
		TOOL_NAMES.GET_PERFORMANCE,
		"Get TouchDesigner performance metrics. Returns global FPS/cook data and per-operator profiling (CPU/GPU cook time, memory, per-frame cost). Use to diagnose FPS drops and find expensive operators.",
		getPerformanceSchema,
		withLiveGuard(
			TOOL_NAMES.GET_PERFORMANCE,
			serverMode,
			tdClient,
			async ({ scope = "/", topN = 20, includeGlobal = true }) => {
				try {
					const script = buildPerfScript(scope, topN, includeGlobal);
					const result = await tdClient.execPythonScript({
						script,
						mode: "read-only",
					});

					if (!result.success) {
						return {
							content: [
								{
									text: `Performance query failed: ${result.error}`,
									type: "text" as const,
								},
							],
							isError: true,
						};
					}

					// Parse the JSON result from TD
					const data = result.data as { result?: string };
					let perfData: Record<string, unknown>;
					try {
						if (typeof data.result === "string") {
							perfData = JSON.parse(data.result) as Record<string, unknown>;
						} else if (data.result != null) {
							perfData = data.result as unknown as Record<string, unknown>;
						} else {
							perfData = {};
						}
					} catch {
						perfData = {};
					}

					// Format output
					const text = formatPerformanceResult(perfData, scope, topN);

					logger.sendLog({
						data: { scope, topN, includeGlobal },
						level: "debug",
						logger: "get_performance",
					});

					return {
						content: [{ text, type: "text" as const }],
					};
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.GET_PERFORMANCE,
					);
				}
			},
		),
	);
}

function formatPerformanceResult(
	data: Record<string, unknown>,
	scope: string,
	topN: number,
): string {
	const lines: string[] = ["## Performance Report\n"];

	// Global metrics
	const global = data.global as Record<string, unknown> | undefined;
	if (global) {
		lines.push(`**Cook Rate:** ${global.cookRate} FPS`);
		lines.push(`**Real Time:** ${global.realTime}`);

		const perfChop = global.performCHOP as
			| { path: string; channels: Record<string, number> }
			| undefined;
		if (perfChop) {
			const ch = perfChop.channels;
			lines.push(`\n**Perform CHOP** (${perfChop.path}):`);
			if (ch.fps !== undefined) lines.push(`  FPS: ${ch.fps}`);
			if (ch.msec !== undefined) lines.push(`  Frame time: ${ch.msec}ms`);
			if (ch.cpumsec !== undefined) lines.push(`  CPU time: ${ch.cpumsec}ms`);
			if (ch.dropped_frames !== undefined)
				lines.push(`  Dropped frames: ${ch.dropped_frames}`);
			if (ch.gpu_mem_used !== undefined)
				lines.push(`  GPU memory: ${ch.gpu_mem_used}MB`);
			if (ch.cpu_mem_used !== undefined)
				lines.push(`  CPU memory: ${ch.cpu_mem_used}MB`);
		}
		lines.push("");
	}

	// Per-operator table
	const operators = data.operators as Array<Record<string, unknown>> | undefined;
	const totalScanned = data.totalScanned as number | undefined;
	if (operators && operators.length > 0) {
		lines.push(
			`**Operators in \`${scope}\`** (${operators.length}/${totalScanned ?? "?"} shown, top ${topN}):\n`,
		);
		lines.push(
			"| Operator | Type | Frame Cost | CPU Cook | GPU Cook | Memory | Cooks |",
		);
		lines.push(
			"|----------|------|-----------|----------|----------|--------|-------|",
		);

		for (const op of operators) {
			const mem =
				((op.cpuMemory as number) || 0) + ((op.gpuMemory as number) || 0);
			const memStr =
				mem > 1048576
					? `${(mem / 1048576).toFixed(1)}MB`
					: mem > 1024
						? `${(mem / 1024).toFixed(0)}KB`
						: `${mem}B`;

			lines.push(
				`| ${op.name} | ${op.type} | ${op.frameCostMs}ms | ${op.cpuCookTime}ms | ${op.gpuCookTime}ms | ${memStr} | ${op.totalCooks} |`,
			);
		}
		lines.push("");
	} else if (operators) {
		lines.push(`No operators found in \`${scope}\``);
	}

	return lines.join("\n");
}
