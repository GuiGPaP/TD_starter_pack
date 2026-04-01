/**
 * Module Help Formatter
 *
 * Formats TouchDesigner module help information with token optimization.
 * Used by GET_MODULE_HELP tool.
 */

import type { ModuleHelp } from "../../../gen/endpoints/TouchDesignerAPI.js";
import {
	DEFAULT_PRESENTER_FORMAT,
	type PresenterFormat,
	presentStructuredData,
} from "./presenter.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

interface ModuleHelpMembers {
	methods: string[];
	properties: string[];
}

interface ModuleHelpContext {
	moduleName: string;
	helpPreview: string;
	fullLength: number;
	sections: string[];
	members: ModuleHelpMembers;
	classInfo?: ClassSummary;
}

/**
 * Format module help result
 */
export function formatModuleHelp(
	data: ModuleHelp | undefined,
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);

	if (!data?.helpText) {
		return "No help information available.";
	}

	const moduleName = data.moduleName ?? "Unknown";
	const helpText = data.helpText;
	const members = extractModuleMembers(helpText);
	const classInfo = extractClassSummary(helpText);

	if (opts.detailLevel === "detailed") {
		return formatDetailed(moduleName, helpText, opts.responseFormat);
	}

	let formattedText = "";
	let context: ModuleHelpContext | undefined;

	switch (opts.detailLevel) {
		case "minimal":
		case "summary": {
			const summary = formatSummary(moduleName, helpText, members, classInfo);
			formattedText = summary.text;
			context = summary.context;
			break;
		}
		default:
			formattedText = helpText;
			context = buildHelpContext(moduleName, helpText, members, classInfo);
	}

	const ctx = context as unknown as Record<string, unknown> | undefined;
	return finalizeFormattedText(formattedText, opts, {
		context: ctx,
		structured: ctx,
		template: "moduleHelp",
	});
}

/**
 * Summary mode: Module name with key sections
 */
function formatSummary(
	moduleName: string,
	helpText: string,
	members: ModuleHelpMembers,
	classInfo?: ClassSummary,
): { text: string; context: ModuleHelpContext } {
	const sections = extractHelpSections(helpText);
	const preview = extractHelpPreview(helpText, 500);
	const memberSummary = formatMemberSummary(members);

	const lines = [`✓ Help information for ${moduleName}`];

	if (classInfo?.definition) {
		lines.push(`Class: ${classInfo.definition}`);
	}

	if (classInfo?.description) {
		lines.push(classInfo.description);
	}

	if (classInfo?.methodResolutionOrder?.length) {
		lines.push(`MRO: ${classInfo.methodResolutionOrder.join(" → ")}`);
	}

	lines.push("");

	if (sections.length > 0) {
		lines.push(`Sections: ${sections.join(", ")}`, "");
	}

	lines.push(preview);

	if (memberSummary) {
		lines.push("", memberSummary);
	}

	if (helpText.length > 500) {
		lines.push(
			"",
			`💡 Use detailLevel='detailed' to see full documentation (${helpText.length} chars total).`,
		);
	}

	return {
		context: {
			classInfo,
			fullLength: helpText.length,
			helpPreview: preview,
			members,
			moduleName,
			sections,
		},
		text: lines.join("\n"),
	};
}

/**
 * Detailed mode: Full help text
 */
function formatDetailed(
	moduleName: string,
	helpText: string,
	format: PresenterFormat | undefined,
): string {
	const title = `Help for ${moduleName}`;
	const payloadFormat = format ?? DEFAULT_PRESENTER_FORMAT;

	// For detailed view, return formatted markdown
	let formatted = `# ${title}\n\n`;
	formatted += "```\n";
	formatted += helpText;
	formatted += "\n```";

	return presentStructuredData(
		{
			context: {
				payloadFormat,
				title,
			},
			detailLevel: "detailed",
			structured: {
				helpText,
				length: helpText.length,
				moduleName,
			},
			template: "moduleHelpDetailed",
			text: formatted,
		},
		payloadFormat,
	);
}

/**
 * Build help context
 */
function buildHelpContext(
	moduleName: string,
	helpText: string,
	members: ModuleHelpMembers,
	classInfo?: ClassSummary,
): ModuleHelpContext {
	return {
		classInfo,
		fullLength: helpText.length,
		helpPreview: extractHelpPreview(helpText, 200),
		members,
		moduleName,
		sections: extractHelpSections(helpText),
	};
}

/**
 * Extract preview from help text
 */
function extractHelpPreview(helpText: string, maxChars: number): string {
	const trimmed = helpText.trim();

	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	// Try to cut at a natural break point (newline)
	const firstPart = trimmed.substring(0, maxChars);
	const lastNewline = firstPart.lastIndexOf("\n");

	if (lastNewline > maxChars * 0.7) {
		return `${firstPart.substring(0, lastNewline)}...`;
	}

	return `${firstPart}...`;
}

/**
 * Extract section headers from help text
 */
function extractHelpSections(helpText: string): string[] {
	const sections: string[] = [];
	const lines = helpText.split("\n");

	// Common help section patterns
	const sectionPatterns = [
		/^([A-Z][A-Za-z\s]+):$/,
		/^\s*([A-Z][A-Z\s]+)$/,
		/^-+\s*$/,
	];

	let lastSection = "";

	for (const line of lines) {
		const trimmed = line.trim();

		// Check for section headers
		for (const pattern of sectionPatterns) {
			const match = trimmed.match(pattern);
			if (match?.[1]) {
				const section = match[1].trim();
				if (section && section !== lastSection && section.length < 50) {
					sections.push(section);
					lastSection = section;
				}
				break;
			}
		}

		// Limit to first 10 sections
		if (sections.length >= 10) {
			break;
		}
	}

	return sections;
}

function addUnique(items: string[], seen: Set<string>, name: string): void {
	if (!seen.has(name)) {
		seen.add(name);
		items.push(name);
	}
}

function extractModuleMembers(helpText: string): ModuleHelpMembers {
	const methods: string[] = [];
	const properties: string[] = [];
	const seenMethods = new Set<string>();
	const seenProperties = new Set<string>();
	const lines = helpText.split("\n");
	let currentCategory: "method" | "property" | undefined;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const headerMatch = trimmed
			.replace(/^\|/, "")
			.trim()
			.match(/^(.*?):$/);
		if (headerMatch) {
			currentCategory = categorizeSection(headerMatch[1]) ?? currentCategory;
			continue;
		}

		if (!currentCategory) continue;

		const entryMatch = trimmed.match(/^\|\s{2,4}([A-Za-z_][\w]*)/);
		if (!entryMatch?.[1]) continue;

		if (currentCategory === "method") {
			addUnique(methods, seenMethods, entryMatch[1]);
		} else {
			addUnique(properties, seenProperties, entryMatch[1]);
		}
	}

	return { methods, properties };
}

interface ClassSummary {
	definition?: string;
	description?: string;
	methodResolutionOrder?: string[];
}

function findClassDefinition(
	lines: string[],
): { definition: string; startIndex: number } | undefined {
	for (let i = 0; i < lines.length; i++) {
		const defMatch = lines[i].trim().match(/^class\s+(.+)$/);
		if (defMatch) return { definition: defMatch[1], startIndex: i + 1 };
	}
	return undefined;
}

function collectDescription(
	lines: string[],
	startIndex: number,
): { lines: string[]; endIndex: number } {
	const result: string[] = [];
	for (let i = startIndex; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed || trimmed.startsWith("|  Methods defined here:")) {
			return { endIndex: i, lines: result };
		}
		if (trimmed.startsWith("|")) {
			const desc = trimmed.replace(/^\|\s*/, "");
			if (desc) result.push(desc);
		}
	}
	return { endIndex: lines.length, lines: result };
}

function collectMro(lines: string[], startIndex: number): string[] {
	const entries: string[] = [];
	for (let i = startIndex; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed.startsWith("|")) break;
		const entry = trimmed.replace(/^\|\s*/, "").trim();
		if (entry) entries.push(entry);
	}
	return entries;
}

function extractClassSummary(helpText: string): ClassSummary | undefined {
	const lines = helpText.split("\n");

	const defResult = findClassDefinition(lines);
	const definition = defResult?.definition;
	const descResult = defResult
		? collectDescription(lines, defResult.startIndex)
		: undefined;
	const descriptionLines = descResult?.lines ?? [];

	// Find MRO section
	let mro: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim().startsWith("|  Method resolution order:")) {
			mro = collectMro(lines, i + 1);
			break;
		}
	}

	if (!definition && descriptionLines.length === 0 && mro.length === 0) {
		return undefined;
	}

	return {
		definition,
		description: descriptionLines.slice(0, 3).join(" "),
		methodResolutionOrder: mro.length ? mro : undefined,
	};
}

function categorizeSection(
	sectionName: string,
): "method" | "property" | undefined {
	const normalized = sectionName.toLowerCase();
	if (normalized.includes("method")) {
		return "method";
	}
	if (
		normalized.includes("descriptor") ||
		normalized.includes("attribute") ||
		normalized.includes("property")
	) {
		return "property";
	}
	return undefined;
}

function formatMemberSummary(
	members: ModuleHelpMembers,
	limitPerGroup?: number,
): string {
	const segments: string[] = [];
	const methodSummary = formatMemberGroup(
		"Methods",
		members.methods,
		limitPerGroup,
	);
	if (methodSummary) {
		segments.push(methodSummary);
	}
	const propertySummary = formatMemberGroup(
		"Properties",
		members.properties,
		limitPerGroup,
	);
	if (propertySummary) {
		segments.push(propertySummary);
	}
	return segments.join("\n\n");
}

function formatMemberGroup(
	label: string,
	items: string[],
	limit?: number,
): string | undefined {
	if (items.length === 0) {
		return undefined;
	}
	const effectiveLimit =
		typeof limit === "number" && Number.isFinite(limit)
			? Math.max(limit, 0)
			: items.length;
	const displayed = items.slice(0, effectiveLimit);
	const suffix = items.length > effectiveLimit ? ", …" : "";
	return `${label} (${items.length}): ${displayed.join(", ")}${suffix}`;
}
