import type { TDTemplateEntry } from "../../resources/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

export function formatTemplateDetail(
	entry: TDTemplateEntry,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	const p = entry.payload;

	const lines: string[] = [`# ${entry.title}`, "", entry.content.summary, ""];

	lines.push(`- **ID:** ${entry.id}`);
	lines.push(`- **Category:** ${p.category}`);
	if (p.difficulty) lines.push(`- **Difficulty:** ${p.difficulty}`);
	if (p.tags && p.tags.length > 0)
		lines.push(`- **Tags:** ${p.tags.join(", ")}`);

	lines.push("", "## Operators");
	for (const op of p.operators) {
		const role = op.role ? ` (${op.role})` : "";
		const pos = op.x != null && op.y != null ? ` @ (${op.x}, ${op.y})` : "";
		lines.push(`- **${op.name}** — ${op.opType} [${op.family}]${role}${pos}`);
	}

	if (p.connections.length > 0) {
		lines.push("", "## Connections");
		for (const c of p.connections) {
			const note = c.note ? ` — ${c.note}` : "";
			lines.push(`- ${c.from} → ${c.to}${note}`);
		}
	}

	if (p.parameters && Object.keys(p.parameters).length > 0) {
		lines.push("", "## Parameters");
		for (const [opName, params] of Object.entries(p.parameters)) {
			const parList = Object.entries(params as Record<string, unknown>)
				.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
				.join(", ");
			lines.push(`- **${opName}:** ${parList}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { category: p.category, title: "Network Template" },
		structured: entry,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatTemplateSearchResults(
	entries: TDTemplateEntry[],
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	if (entries.length === 0) {
		return finalizeFormattedText(
			"No network templates found matching your query.",
			opts,
			{ context: { title: "Template Search" } },
		);
	}

	const lines: string[] = [
		`## ${entries.length} Network Template(s) Found`,
		"",
	];

	for (const e of entries) {
		const p = e.payload;
		const diff = p.difficulty ? ` [${p.difficulty}]` : "";
		const ops = p.operators.map((o) => o.name).join(", ");

		if (opts.detailLevel === "minimal") {
			lines.push(`- **${e.title}** (${e.id})${diff}`);
		} else {
			lines.push(`### ${e.title}`);
			lines.push(`- **ID:** ${e.id}`);
			lines.push(`- **Category:** ${p.category}${diff}`);
			lines.push(`- **Operators:** ${ops}`);
			lines.push(`- ${e.content.summary}`);
			lines.push("");
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { count: entries.length, title: "Template Search" },
		structured: entries.map((e) => ({
			category: e.payload.category,
			id: e.id,
			title: e.title,
		})),
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

interface DeployResult {
	connections: number;
	errors: string[];
	operators: string[];
	parameters: number;
	parentPath: string;
	templateId: string;
}

export function formatDeployTemplateResult(
	result: DeployResult,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	const lines: string[] = [
		`## Deployed Template \`${result.templateId}\``,
		"",
		`- **Parent:** ${result.parentPath}`,
		`- **Operators created:** ${result.operators.length}`,
		`- **Connections wired:** ${result.connections}`,
		`- **Parameters set:** ${result.parameters}`,
	];

	if (result.errors.length > 0) {
		lines.push("", "## Errors");
		for (const e of result.errors) {
			lines.push(`- ${e}`);
		}
	}

	if (opts.detailLevel !== "minimal") {
		lines.push("", "## Operators");
		for (const op of result.operators) {
			lines.push(`- ${op}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { templateId: result.templateId, title: "Deploy Template" },
		structured: result,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
