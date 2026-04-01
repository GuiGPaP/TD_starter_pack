import type { TDGlslPatternEntry } from "../../resources/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

interface PatternDetailOptions extends FormatterOpts {
	includeCode?: boolean;
	includeSetup?: boolean;
}

// ── Pattern detail helpers ─────────────────────────────────────

function pushPatternMetadata(lines: string[], entry: TDGlslPatternEntry): void {
	const p = entry.payload;
	lines.push(`- **ID:** ${entry.id}`);
	lines.push(`- **Type:** ${p.type}`);
	lines.push(`- **Difficulty:** ${p.difficulty}`);
	if (p.estimatedGpuCost) {
		lines.push(`- **GPU Cost:** ${p.estimatedGpuCost}`);
	}
	if (p.minVersion) {
		lines.push(`- **Min TD Version:** ${p.minVersion}`);
	}
	if (p.tags && p.tags.length > 0) {
		lines.push(`- **Tags:** ${p.tags.join(", ")}`);
	}
}

function pushWarningsSection(lines: string[], warnings?: string[]): void {
	if (!warnings || warnings.length === 0) return;
	lines.push("", "## Warnings");
	for (const w of warnings) {
		lines.push(`- ${w}`);
	}
}

function pushCodeSection(
	lines: string[],
	payload: TDGlslPatternEntry["payload"],
): void {
	lines.push("", "## GLSL Code", "", "```glsl", payload.code.glsl, "```");
	if (payload.code.vertexGlsl) {
		lines.push(
			"",
			"## Vertex Shader",
			"",
			"```glsl",
			payload.code.vertexGlsl,
			"```",
		);
	}
}

function pushSetupSection(
	lines: string[],
	payload: TDGlslPatternEntry["payload"],
): void {
	lines.push("", "## Setup");
	if (payload.setup.operators.length > 0) {
		lines.push("", "### Operators");
		for (const op of payload.setup.operators) {
			const role = op.role ? ` (${op.role})` : "";
			lines.push(`- **${op.name}**: ${op.type} [${op.family}]${role}`);
		}
	}
	if (payload.setup.uniforms && payload.setup.uniforms.length > 0) {
		lines.push("", "### Uniforms");
		for (const u of payload.setup.uniforms) {
			const def = u.default ? ` = ${u.default}` : "";
			const desc = u.description ? ` — ${u.description}` : "";
			lines.push(`- **${u.name}**: ${u.type}${def}${desc}`);
		}
	}
	if (payload.setup.connections && payload.setup.connections.length > 0) {
		lines.push("", "### Connections");
		for (const c of payload.setup.connections) {
			lines.push(`- ${c.from}[${c.fromOutput}] → ${c.to}[${c.toInput}]`);
		}
	}
}

function buildPatternStructured(
	entry: TDGlslPatternEntry,
	includeCode: boolean,
	includeSetup: boolean,
): Record<string, unknown> {
	const p = entry.payload;
	const structured: Record<string, unknown> = {
		difficulty: p.difficulty,
		id: entry.id,
		summary: entry.content.summary,
		title: entry.title,
		type: p.type,
	};
	if (p.estimatedGpuCost) structured.estimatedGpuCost = p.estimatedGpuCost;
	if (p.tags) structured.tags = p.tags;
	if (p.minVersion) structured.minVersion = p.minVersion;
	if (entry.content.warnings) structured.warnings = entry.content.warnings;
	if (includeCode) structured.code = p.code;
	if (includeSetup) structured.setup = p.setup;
	return structured;
}

// ── Deploy result helpers ──────────────────────────────────────

function pushDeploySummary(
	lines: string[],
	result: Record<string, unknown>,
): void {
	const message = result.message ? String(result.message) : undefined;
	const path = result.path ? String(result.path) : undefined;
	const status = String(result.status ?? "unknown");
	const postCheckStatus = result.postCheckStatus
		? String(result.postCheckStatus)
		: undefined;

	if (message) {
		lines.push(message, "");
	}
	if (path) {
		lines.push(`- **Path:** ${path}`);
	}
	lines.push(`- **Status:** ${status}`);
	if (postCheckStatus) {
		lines.push(`- **Post-check:** ${postCheckStatus}`);
	}
}

function pushFailureDetails(
	lines: string[],
	result: Record<string, unknown>,
): void {
	const failedStep = result.failedStep ? String(result.failedStep) : undefined;
	const rollbackStatus = result.rollbackStatus
		? String(result.rollbackStatus)
		: undefined;
	const completedSteps = Array.isArray(result.completedSteps)
		? result.completedSteps
		: undefined;

	if (failedStep) {
		lines.push(`- **Failed step:** ${failedStep}`);
	}
	if (rollbackStatus) {
		lines.push(`- **Rollback:** ${rollbackStatus}`);
	}
	if (completedSteps && completedSteps.length > 0) {
		lines.push(
			`- **Completed steps:** ${completedSteps.map(String).join(" → ")}`,
		);
	}
}

function pushGlslValidation(
	lines: string[],
	validations: unknown[] | undefined,
): void {
	if (!validations || validations.length === 0) return;
	lines.push("", "## GLSL Validation");
	for (const v of validations) {
		const val = v as Record<string, unknown>;
		if (val.status === "skipped") {
			lines.push(`- **${val.path}**: skipped (${val.reason})`);
		} else {
			const ok = val.valid ? "valid" : "ERRORS";
			lines.push(`- **${val.path}**: ${ok}`);
		}
	}
}

function pushCreatedNodes(lines: string[], nodes: unknown[]): void {
	if (nodes.length === 0) return;
	lines.push("", "## Created Nodes");
	for (const n of nodes) {
		const node = n as Record<string, unknown>;
		lines.push(`- **${node.name}**: ${node.type} → ${node.path ?? ""}`);
	}
}

function pushUniforms(
	lines: string[],
	uniforms: unknown[],
	isDryRun: boolean,
): void {
	if (uniforms.length === 0) return;

	if (isDryRun) {
		lines.push("", "## Planned Uniforms");
		for (const u of uniforms) {
			const uni = u as Record<string, unknown>;
			const expr = uni.expression ? ` = \`${uni.expression}\`` : "";
			lines.push(`- **${uni.name}** (${uni.type})${expr}`);
		}
	} else {
		lines.push("", "## Uniforms (manual configuration needed)");
		for (const u of uniforms) {
			const uni = u as Record<string, unknown>;
			const expr = uni.expression ? ` = \`${uni.expression}\`` : "";
			const desc = uni.description ? ` — ${uni.description}` : "";
			lines.push(`- **${uni.name}** (${uni.type})${expr}${desc}`);
			if (uni.page) {
				lines.push(`  Page: ${uni.page}`);
			}
		}
	}
}

// ── Exported formatters ────────────────────────────────────────

/**
 * Format a single GLSL pattern for the get_glsl_pattern tool response.
 * includeCode and includeSetup flags apply to BOTH markdown text AND structured output.
 */
export function formatGlslPatternDetail(
	entry: TDGlslPatternEntry,
	options?: PatternDetailOptions,
): string {
	const opts = mergeFormatterOptions(options);
	const includeCode = options?.includeCode ?? true;
	const includeSetup = options?.includeSetup ?? true;

	const lines: string[] = [`# ${entry.title}`, "", entry.content.summary, ""];

	pushPatternMetadata(lines, entry);
	pushWarningsSection(lines, entry.content.warnings);
	if (includeCode) pushCodeSection(lines, entry.payload);
	if (includeSetup) pushSetupSection(lines, entry.payload);

	const structured = buildPatternStructured(entry, includeCode, includeSetup);

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: `GLSL Pattern: ${entry.title}` },
		structured,
	});
}

/**
 * Format GLSL pattern search results for the search_glsl_patterns tool response.
 */
export function formatGlslPatternSearchResults(
	entries: TDGlslPatternEntry[],
	options?: FormatterOpts & { query?: string },
): string {
	const opts = mergeFormatterOptions(options);

	if (entries.length === 0) {
		const hint = options?.query
			? `No GLSL patterns found for "${options.query}".`
			: "No GLSL patterns found matching the given filters.";
		return finalizeFormattedText(hint, opts);
	}

	const lines: string[] = [`# GLSL Patterns (${entries.length} results)`, ""];

	for (const entry of entries) {
		const p = entry.payload;
		const tags = p.tags?.length ? ` [${p.tags.join(", ")}]` : "";
		lines.push(
			`- **${entry.title}** (\`${entry.id}\`) — ${p.type} | ${p.difficulty}${tags}`,
		);
		lines.push(`  ${entry.content.summary}`);
	}

	const structured = entries.map((e) => ({
		difficulty: e.payload.difficulty,
		id: e.id,
		summary: e.content.summary,
		title: e.title,
		type: e.payload.type,
	}));

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { query: options?.query, resultCount: entries.length },
		structured,
	});
}

/**
 * Format deploy result for the deploy_glsl_pattern tool response.
 */
export function formatGlslDeployResult(
	result: Record<string, unknown>,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	const status = String(result.status ?? "unknown");
	const patternId = String(result.patternId ?? "");
	const createdNodes = Array.isArray(result.createdNodes)
		? result.createdNodes
		: [];
	const uniforms = Array.isArray(result.uniforms) ? result.uniforms : [];
	const glslValidation = Array.isArray(result.glslValidation)
		? result.glslValidation
		: undefined;

	const lines: string[] = [`# Deploy: ${patternId} — ${status}`, ""];

	pushDeploySummary(lines, result);
	pushFailureDetails(lines, result);
	pushGlslValidation(lines, glslValidation);
	pushCreatedNodes(lines, createdNodes);
	pushUniforms(lines, uniforms, status === "dry_run");

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: `Deploy: ${patternId}` },
		structured: result,
	});
}
