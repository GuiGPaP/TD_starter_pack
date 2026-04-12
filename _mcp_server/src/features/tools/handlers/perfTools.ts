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
    # Read REAL fps from the built-in Perform CHOP in the MCP tox
    real_fps = project.cookRate  # fallback
    perf_chop_data = None
    perf = op('/mcp_webserver_base/_perf_monitor')
    if not perf:
        # Fallback: scan for any Perform CHOP
        for comp_path in [scope, '/']:
            c = op(comp_path)
            if not c or not c.isCOMP:
                continue
            for child in c.findChildren(depth=5):
                if child.OPType == 'performCHOP' and child.isCHOP:
                    perf = child
                    break
            if perf:
                break
    if perf:
        chans = {}
        for ch in perf.chans():
            chans[ch.name] = round(ch[0], 3)
        perf_chop_data = {'path': perf.path, 'channels': chans}
        if 'fps' in chans:
            real_fps = chans['fps']

    result_data['global'] = {
        'cookRate': real_fps,
        'targetRate': project.cookRate,
        'realTime': project.realTime,
    }
    if perf_chop_data:
        result_data['global']['performCHOP'] = perf_chop_data

    # --- Trail stats (statistical analysis over 5s window) ---
    trail = op('/mcp_webserver_base/_perf_trail')
    if trail and trail.numSamples > 1:
        import numpy as np
        trail_stats = {}
        for ch in trail.chans():
            arr = np.array(ch.vals)
            if len(arr) == 0:
                continue
            trail_stats[ch.name] = {
                'avg': round(float(np.mean(arr)), 2),
                'min': round(float(np.min(arr)), 2),
                'max': round(float(np.max(arr)), 2),
                'p95': round(float(np.percentile(arr, 95)), 2),
                'stddev': round(float(np.std(arr)), 2),
            }
        result_data['global']['trailStats'] = trail_stats

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
	includeGlobal: z
		.boolean()
		.describe(
			"Include global performance metrics (FPS, cook rate, Perform CHOP data). Default: true",
		)
		.optional(),
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
						mode: "read-only",
						script,
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
						data: { includeGlobal, scope, topN },
						level: "debug",
						logger: "get_performance",
					});

					return {
						content: [{ text, type: "text" as const }],
					};
				} catch (error) {
					return handleToolError(error, logger, TOOL_NAMES.GET_PERFORMANCE);
				}
			},
		),
	);
}

function pushGlobalSection(
	lines: string[],
	global: Record<string, unknown>,
): void {
	lines.push(
		`**FPS:** ${global.cookRate} (target: ${global.targetRate ?? global.cookRate})`,
	);
	lines.push(`**Real Time:** ${global.realTime}`);

	const perfChop = global.performCHOP as
		| { path: string; channels: Record<string, number> }
		| undefined;
	if (perfChop) {
		pushPerformChopSection(lines, perfChop);
	}

	const trailStats = global.trailStats as
		| Record<
				string,
				{ avg: number; min: number; max: number; p95: number; stddev: number }
		  >
		| undefined;
	if (trailStats) {
		pushTrailStatsSection(lines, trailStats);
	}
	lines.push("");
}

function pushPerformChopSection(
	lines: string[],
	perfChop: { path: string; channels: Record<string, number> },
): void {
	const ch = perfChop.channels;
	if (ch.msec !== undefined) lines.push(`**Frame time:** ${ch.msec}ms`);
	if (ch.dropped_frames !== undefined && ch.dropped_frames > 0)
		lines.push(`**⚠ Dropped frames:** ${ch.dropped_frames}`);
	if (ch.gpumsec !== undefined) lines.push(`**GPU time:** ${ch.gpumsec}ms`);
	if (ch.cpumsec !== undefined) lines.push(`**CPU time:** ${ch.cpumsec}ms`);
	if (ch.gpu_mem_used !== undefined)
		lines.push(`**GPU memory:** ${ch.gpu_mem_used}MB`);
}

type TrailStat = {
	avg: number;
	min: number;
	max: number;
	p95: number;
	stddev: number;
};

function pushTrailStatsSection(
	lines: string[],
	stats: Record<string, TrailStat>,
): void {
	lines.push("\n**Performance (5s window):**\n");
	lines.push("| Metric | Avg | Min | Max | P95 | StdDev |");
	lines.push("|--------|-----|-----|-----|-----|--------|");
	const order: [string, string][] = [
		["fps", "FPS"],
		["msec", "Frame (ms)"],
		["cpumsec", "CPU (ms)"],
		["dropped_frames", "Drops"],
		["gpu_mem_used", "GPU Mem (MB)"],
	];
	for (const [key, label] of order) {
		const s = stats[key];
		if (!s) continue;
		lines.push(
			`| ${label} | ${s.avg} | ${s.min} | ${s.max} | ${s.p95} | ${s.stddev} |`,
		);
	}
}

function formatMemorySize(cpuMem: number, gpuMem: number): string {
	const mem = cpuMem + gpuMem;
	if (mem > 1048576) return `${(mem / 1048576).toFixed(1)}MB`;
	if (mem > 1024) return `${(mem / 1024).toFixed(0)}KB`;
	return `${mem}B`;
}

function pushOperatorsTable(
	lines: string[],
	operators: Array<Record<string, unknown>>,
	scope: string,
	topN: number,
	totalScanned: number | undefined,
): void {
	if (operators.length === 0) {
		lines.push(`No operators found in \`${scope}\``);
		return;
	}
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
		const memStr = formatMemorySize(
			(op.cpuMemory as number) || 0,
			(op.gpuMemory as number) || 0,
		);
		lines.push(
			`| ${op.name} | ${op.type} | ${op.frameCostMs}ms | ${op.cpuCookTime}ms | ${op.gpuCookTime}ms | ${memStr} | ${op.totalCooks} |`,
		);
	}
	lines.push("");
}

function formatPerformanceResult(
	data: Record<string, unknown>,
	scope: string,
	topN: number,
): string {
	const lines: string[] = ["## Performance Report\n"];

	const global = data.global as Record<string, unknown> | undefined;
	if (global) pushGlobalSection(lines, global);

	const operators = data.operators as
		| Array<Record<string, unknown>>
		| undefined;
	if (operators) {
		pushOperatorsTable(
			lines,
			operators,
			scope,
			topN,
			data.totalScanned as number | undefined,
		);
	}

	return lines.join("\n");
}
