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
	const p = entry.payload;

	const lines: string[] = [`# ${entry.title}`, "", entry.content.summary, ""];

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

	if (entry.content.warnings && entry.content.warnings.length > 0) {
		lines.push("", "## Warnings");
		for (const w of entry.content.warnings) {
			lines.push(`- ${w}`);
		}
	}

	if (includeCode) {
		lines.push("", "## GLSL Code", "", "```glsl", p.code.glsl, "```");
		if (p.code.vertexGlsl) {
			lines.push(
				"",
				"## Vertex Shader",
				"",
				"```glsl",
				p.code.vertexGlsl,
				"```",
			);
		}
	}

	if (includeSetup) {
		lines.push("", "## Setup");
		if (p.setup.operators.length > 0) {
			lines.push("", "### Operators");
			for (const op of p.setup.operators) {
				const role = op.role ? ` (${op.role})` : "";
				lines.push(`- **${op.name}**: ${op.type} [${op.family}]${role}`);
			}
		}
		if (p.setup.uniforms && p.setup.uniforms.length > 0) {
			lines.push("", "### Uniforms");
			for (const u of p.setup.uniforms) {
				const def = u.default ? ` = ${u.default}` : "";
				const desc = u.description ? ` — ${u.description}` : "";
				lines.push(`- **${u.name}**: ${u.type}${def}${desc}`);
			}
		}
		if (p.setup.connections && p.setup.connections.length > 0) {
			lines.push("", "### Connections");
			for (const c of p.setup.connections) {
				lines.push(`- ${c.from}[${c.fromOutput}] → ${c.to}[${c.toInput}]`);
			}
		}
	}

	// Build structured output — flags apply here too
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
	const path = result.path ? String(result.path) : undefined;
	const message = result.message ? String(result.message) : undefined;
	const createdNodes = Array.isArray(result.createdNodes)
		? result.createdNodes
		: [];
	const uniforms = Array.isArray(result.uniforms) ? result.uniforms : [];

	const lines: string[] = [`# Deploy: ${patternId} — ${status}`, ""];

	if (message) {
		lines.push(message, "");
	}
	if (path) {
		lines.push(`- **Path:** ${path}`);
	}
	lines.push(`- **Status:** ${status}`);

	const postCheckStatus = result.postCheckStatus
		? String(result.postCheckStatus)
		: undefined;
	if (postCheckStatus) {
		lines.push(`- **Post-check:** ${postCheckStatus}`);
	}

	// Failure details
	const completedSteps = Array.isArray(result.completedSteps)
		? result.completedSteps
		: undefined;
	const failedStep = result.failedStep ? String(result.failedStep) : undefined;
	const rollbackStatus = result.rollbackStatus
		? String(result.rollbackStatus)
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

	// GLSL validation results
	const glslValidation = Array.isArray(result.glslValidation)
		? result.glslValidation
		: undefined;
	if (glslValidation && glslValidation.length > 0) {
		lines.push("", "## GLSL Validation");
		for (const v of glslValidation) {
			const val = v as Record<string, unknown>;
			if (val.status === "skipped") {
				lines.push(`- **${val.path}**: skipped (${val.reason})`);
			} else {
				const ok = val.valid ? "valid" : "ERRORS";
				lines.push(`- **${val.path}**: ${ok}`);
			}
		}
	}

	if (createdNodes.length > 0) {
		lines.push("", "## Created Nodes");
		for (const n of createdNodes) {
			const node = n as Record<string, unknown>;
			lines.push(`- **${node.name}**: ${node.type} → ${node.path ?? ""}`);
		}
	}

	if (uniforms.length > 0 && status !== "dry_run") {
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

	if (status === "dry_run" && uniforms.length > 0) {
		lines.push("", "## Planned Uniforms");
		for (const u of uniforms) {
			const uni = u as Record<string, unknown>;
			const expr = uni.expression ? ` = \`${uni.expression}\`` : "";
			lines.push(`- **${uni.name}** (${uni.type})${expr}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: `Deploy: ${patternId}` },
		structured: result,
	});
}
