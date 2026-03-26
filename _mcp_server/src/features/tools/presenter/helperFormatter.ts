import type {
	ConfigureInstancing200ResponseData,
	CreateFeedbackLoop200ResponseData,
	CreateGeometryComp200ResponseData,
} from "../../../gen/endpoints/TouchDesignerAPI.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

export function formatCreateGeometryComp(
	data: CreateGeometryComp200ResponseData,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText(
			"Geometry COMP created but no details returned.",
			opts,
			{ context: { title: "Create Geometry COMP" } },
		);
	}

	const path = (data as Record<string, unknown>).path ?? "(unknown)";
	const text = `✓ Created geometry COMP at ${path}`;

	return finalizeFormattedText(text, opts, {
		context: { title: "Create Geometry COMP" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatCreateFeedbackLoop(
	data: CreateFeedbackLoop200ResponseData,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText(
			"Feedback loop created but no details returned.",
			opts,
			{ context: { title: "Create Feedback Loop" } },
		);
	}

	const path = (data as Record<string, unknown>).path ?? "(unknown)";
	const text = `✓ Created feedback loop at ${path}`;

	return finalizeFormattedText(text, opts, {
		context: { title: "Create Feedback Loop" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatConfigureInstancing(
	data: ConfigureInstancing200ResponseData,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText(
			"Instancing configured but no details returned.",
			opts,
			{ context: { title: "Configure Instancing" } },
		);
	}

	const geoPath = (data as Record<string, unknown>).geoPath ?? "(unknown)";
	const text = `✓ Instancing configured on ${geoPath}`;

	return finalizeFormattedText(text, opts, {
		context: { title: "Configure Instancing" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
