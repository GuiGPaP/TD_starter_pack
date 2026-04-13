import type { ExportSubgraph200Data } from "../../../gen/endpoints/TouchDesignerAPI.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

export function formatExportSubgraphResult(
	data: ExportSubgraph200Data,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Subgraph export returned no data.", opts, {
			context: { title: "Export Subgraph" },
		});
	}

	const nodes = data.nodes ?? [];
	const internal = data.edgesInternal ?? [];
	const incoming = data.edgesIncoming ?? [];
	const outgoing = data.edgesOutgoing ?? [];
	const parent = data.parent ?? "(unknown)";

	const summary = `✓ Subgraph under ${parent}: ${nodes.length} node(s), ${internal.length} internal, ${incoming.length} incoming, ${outgoing.length} outgoing edge(s)`;

	if (opts.detailLevel === "minimal") {
		return finalizeFormattedText(summary, opts, {
			context: { parent, title: "Export Subgraph" },
			structured: data,
		});
	}

	const lines = [summary, ""];

	if (nodes.length > 0) {
		lines.push("## Nodes");
		for (const n of nodes) {
			lines.push(`  ${n.path} (${n.opType}, ${n.family})`);
		}
		lines.push("");
	}

	if (internal.length > 0) {
		lines.push("## Internal Edges");
		for (const e of internal) {
			lines.push(`  ${e.from}[${e.fromOutput}] → ${e.to}[${e.toInput}]`);
		}
		lines.push("");
	}

	if (incoming.length > 0) {
		lines.push("## Incoming Edges");
		for (const e of incoming) {
			lines.push(`  ${e.from}[${e.fromOutput}] → ${e.to}[${e.toInput}]`);
		}
		lines.push("");
	}

	if (outgoing.length > 0) {
		lines.push("## Outgoing Edges");
		for (const e of outgoing) {
			lines.push(`  ${e.from}[${e.fromOutput}] → ${e.to}[${e.toInput}]`);
		}
	}

	return finalizeFormattedText(lines.join("\n").trim(), opts, {
		context: { parent, title: "Export Subgraph" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
