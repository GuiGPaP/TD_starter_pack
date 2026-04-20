import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { operatorEntryIdFromOpType } from "./operatorRuntimeCache.js";
import type { TDOperatorEntry } from "./types.js";

const OFFLINE_HELP_ENV = "TD_MCP_OFFLINE_HELP_PATH";
const OPERATOR_FILE_RE =
	/^(?<name>.+)_(?<family>CHOP|SOP|TOP|DAT|MAT|COMP|POP)\.html?$/i;
const TAG_RE = /<[^>]+>/g;
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const PAR_NAME_SPAN_RE =
	/<span\b[^>]*class=["'][^"']*\bparName(?:CHOP|SOP|TOP|DAT|MAT|COMP|POP)?\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;

export interface OfflineHelpIndexOptions {
	maxFiles?: number;
	offlineHelpPath?: string;
}

export interface OfflineHelpIndexResult {
	entries: TDOperatorEntry[];
	errors: Array<{ file: string; error: string }>;
	filesParsed: number;
	filesScanned: number;
	sourcePath: string;
}

export function findOfflineHelpPath(explicitPath?: string): string | null {
	const candidates = [
		explicitPath,
		process.env[OFFLINE_HELP_ENV],
		...defaultOfflineHelpPaths(),
	].filter((path): path is string => Boolean(path));

	for (const path of candidates) {
		if (existsSync(path) && statSync(path).isDirectory()) return path;
	}
	return null;
}

export function indexOfflineHelpOperators(
	options: OfflineHelpIndexOptions = {},
): OfflineHelpIndexResult {
	const sourcePath = findOfflineHelpPath(options.offlineHelpPath);
	if (!sourcePath) {
		throw new Error(
			`TouchDesigner OfflineHelp path not found. Pass offlineHelpPath or set ${OFFLINE_HELP_ENV}.`,
		);
	}

	const maxFiles = options.maxFiles ?? 1000;
	const files = discoverOperatorHtmlFiles(sourcePath, maxFiles);
	const entries: TDOperatorEntry[] = [];
	const errors: OfflineHelpIndexResult["errors"] = [];

	for (const file of files) {
		try {
			const parsed = parseOfflineHelpOperator(file);
			if (parsed) entries.push(parsed);
		} catch (error) {
			errors.push({
				error: error instanceof Error ? error.message : String(error),
				file,
			});
		}
	}

	return {
		entries,
		errors,
		filesParsed: entries.length,
		filesScanned: files.length,
		sourcePath,
	};
}

export function parseOfflineHelpOperator(
	filePath: string,
): TDOperatorEntry | null {
	const fileName = basename(filePath);
	const match = OPERATOR_FILE_RE.exec(fileName);
	if (!match?.groups) return null;

	const family = match.groups.family.toUpperCase();
	const rawName = match.groups.name;
	const opType = `${slugifyForOpType(rawName)}${family}`;
	const html = readFileSync(filePath, "utf8");
	const title =
		extractFirstTagText(html, "h1") || titleFromFile(rawName, family);
	const summary =
		extractFirstMeaningfulParagraph(html) ||
		`${title} operator metadata from local TouchDesigner OfflineHelp.`;
	const parameters = extractParameters(html);

	return {
		content: {
			summary,
			warnings: [
				"Generated from the user's local TouchDesigner OfflineHelp cache; do not redistribute generated cache files.",
			],
		},
		id: operatorEntryIdFromOpType(opType),
		kind: "operator",
		payload: {
			opFamily: family,
			opType,
			parameters,
		},
		provenance: {
			confidence: "high",
			license: "local-user-cache-not-redistributed",
			source: "local-offline-help",
		},
		searchKeywords: buildKeywords(title, opType, family, summary, parameters),
		title,
	};
}

function defaultOfflineHelpPaths(): string[] {
	const paths: string[] = [];
	if (process.platform === "win32") {
		const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
		paths.push(
			join(
				programFiles,
				"Derivative",
				"TouchDesigner",
				"Samples",
				"Learn",
				"OfflineHelp",
				"https.docs.derivative.ca",
			),
		);
	}
	if (process.platform === "darwin") {
		paths.push(
			"/Applications/TouchDesigner.app/Contents/Resources/tfs/Samples/Learn/OfflineHelp/https.docs.derivative.ca",
		);
	}
	return paths;
}

function discoverOperatorHtmlFiles(root: string, maxFiles: number): string[] {
	const files: string[] = [];
	const stack = [root];
	while (stack.length > 0 && files.length < maxFiles) {
		const dir = stack.pop();
		if (!dir) continue;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(fullPath);
				continue;
			}
			if (entry.isFile() && OPERATOR_FILE_RE.test(entry.name)) {
				files.push(fullPath);
				if (files.length >= maxFiles) break;
			}
		}
	}
	return files.sort();
}

function extractParameters(
	html: string,
): TDOperatorEntry["payload"]["parameters"] {
	const parameters: TDOperatorEntry["payload"]["parameters"] = [];
	const divMatches = html.match(/<div\b[^>]*>[\s\S]*?<\/div>/gi) ?? [];
	for (const block of divMatches) {
		const span = PAR_NAME_SPAN_RE.exec(block);
		if (!span) continue;

		const label = htmlToText(span[1]);
		if (!label) continue;

		const descriptionText = htmlToText(block.replace(PAR_NAME_SPAN_RE, ""));
		const internalName = extractInternalName(descriptionText) ?? label;
		parameters.push({
			description: descriptionText || undefined,
			label,
			name: internalName,
		});
	}
	return parameters;
}

function extractInternalName(description: string): string | null {
	const match = /^([a-z][a-z0-9_]*[a-z0-9])\s*[-–]\s+/i.exec(description);
	return match?.[1] ?? null;
}

function extractFirstTagText(html: string, tagName: string): string | null {
	const match = new RegExp(
		`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
		"i",
	).exec(html);
	const text = match ? htmlToText(match[1]) : "";
	return text || null;
}

function extractFirstMeaningfulParagraph(html: string): string | null {
	const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
	for (const paragraph of paragraphs) {
		const text = htmlToText(paragraph);
		if (text.length > 20) return text;
	}
	return null;
}

function htmlToText(html: string): string {
	return decodeEntities(
		html
			.replace(SCRIPT_STYLE_RE, "")
			.replace(TAG_RE, " ")
			.replace(/\s+/g, " ")
			.trim(),
	);
}

function decodeEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCodePoint(Number(code)),
		);
}

function titleFromFile(rawName: string, family: string): string {
	const words = rawName.replace(/[_-]+/g, " ").trim();
	return `${words} ${family}`.replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugifyForOpType(rawName: string): string {
	return rawName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function buildKeywords(
	title: string,
	opType: string,
	family: string,
	summary: string,
	parameters: TDOperatorEntry["payload"]["parameters"],
): string[] {
	const words = `${title} ${opType} ${family} ${summary}`
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 2);
	for (const parameter of parameters) {
		words.push(parameter.name.toLowerCase());
		if (parameter.label) words.push(parameter.label.toLowerCase());
	}
	return [...new Set(words)].slice(0, 120);
}
