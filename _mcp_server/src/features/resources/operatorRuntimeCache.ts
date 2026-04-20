import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ILogger } from "../../core/logger.js";
import {
	knowledgeEntrySchema,
	type TDKnowledgeEntry,
	type TDOperatorEntry,
} from "./types.js";

const CACHE_VERSION = 1;
const CACHE_ENV = "TD_MCP_OPERATOR_CACHE_DIR";
const LATEST_CACHE_FILE = "operators-latest.json";
const OP_FAMILY_SUFFIXES = ["CHOP", "SOP", "TOP", "DAT", "COMP", "MAT", "POP"];
const TEXT_PROVENANCE = new Set(["local-offline-help"]);

const runtimeOperatorCacheSchema = z.object({
	entries: z.array(knowledgeEntrySchema),
	generatedAt: z.string(),
	tdBuild: z.string().nullable().optional(),
	tdVersion: z.string().nullable().optional(),
	version: z.literal(CACHE_VERSION),
});

export interface RuntimeOperatorCacheWriteResult {
	cachePath: string;
	latestPath: string;
}

function getDefaultCacheRoot(): string {
	if (process.platform === "win32") {
		return (
			process.env.LOCALAPPDATA ??
			process.env.APPDATA ??
			join(homedir(), "AppData", "Local")
		);
	}
	return process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
}

function sanitizeBuild(build: string | null | undefined): string {
	const normalized = (build ?? "unknown").trim().toLowerCase();
	return (
		normalized.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
		"unknown"
	);
}

function operatorCacheFileName(tdBuild: string | null | undefined): string {
	return `operators-${sanitizeBuild(tdBuild)}.json`;
}

function getCachePath(tdBuild: string | null | undefined): string {
	return join(resolveOperatorCacheDir(), operatorCacheFileName(tdBuild));
}

function logWarning(logger: ILogger | undefined, data: unknown): void {
	logger?.sendLog({
		data,
		level: "warning",
		logger: "operatorRuntimeCache",
	});
}

function loadCacheFile(path: string, logger?: ILogger): TDOperatorEntry[] {
	try {
		const raw = JSON.parse(readFileSync(path, "utf8"));
		const parsed = runtimeOperatorCacheSchema.parse(raw);
		return parsed.entries.filter(
			(entry): entry is TDKnowledgeEntry & { kind: "operator" } =>
				entry.kind === "operator",
		);
	} catch (error) {
		logWarning(logger, {
			error: error instanceof Error ? error.message : String(error),
			message: "Failed to load runtime operator cache",
			path,
		});
		return [];
	}
}

export function resolveOperatorCacheDir(): string {
	return (
		process.env[CACHE_ENV] ??
		join(getDefaultCacheRoot(), "td-starter-pack", "operator-cache")
	);
}

export function loadRuntimeOperatorEntries(
	tdBuild?: string | null,
	logger?: ILogger,
): TDOperatorEntry[] {
	const cacheDir = resolveOperatorCacheDir();
	if (!existsSync(cacheDir)) return [];

	const exactPath = getCachePath(tdBuild);
	if (tdBuild && existsSync(exactPath)) {
		return loadCacheFile(exactPath, logger);
	}

	const latestPath = join(cacheDir, LATEST_CACHE_FILE);
	if (existsSync(latestPath)) {
		return loadCacheFile(latestPath, logger);
	}

	return [];
}

export function saveRuntimeOperatorEntries(
	entries: TDOperatorEntry[],
	tdBuild?: string | null,
	tdVersion?: string | null,
): RuntimeOperatorCacheWriteResult {
	const cacheDir = resolveOperatorCacheDir();
	mkdirSync(cacheDir, { recursive: true });

	const payload = {
		entries,
		generatedAt: new Date().toISOString(),
		tdBuild: tdBuild ?? null,
		tdVersion: tdVersion ?? null,
		version: CACHE_VERSION,
	};

	const serialized = `${JSON.stringify(payload, null, 2)}\n`;
	const cachePath = getCachePath(tdBuild);
	const latestPath = join(cacheDir, LATEST_CACHE_FILE);
	writeFileSync(cachePath, serialized, "utf8");
	writeFileSync(latestPath, serialized, "utf8");
	return { cachePath, latestPath };
}

export function mergeOperatorEntries(
	existing: TDOperatorEntry,
	incoming: TDOperatorEntry,
): TDOperatorEntry {
	const textEntry = pickTextEntry(existing, incoming);
	const factEntry = pickFactEntry(existing, incoming);

	return {
		...textEntry,
		content: {
			summary: textEntry.content.summary || factEntry.content.summary,
			warnings: unionStrings(
				textEntry.content.warnings ?? [],
				factEntry.content.warnings ?? [],
			),
		},
		payload: {
			opFamily: factEntry.payload.opFamily || textEntry.payload.opFamily,
			opType: factEntry.payload.opType || textEntry.payload.opType,
			parameters: mergeParameters(
				textEntry.payload.parameters,
				factEntry.payload.parameters,
			),
			versions: textEntry.payload.versions ?? factEntry.payload.versions,
		},
		searchKeywords: unionStrings(
			textEntry.searchKeywords,
			factEntry.searchKeywords,
		),
	};
}

export function mergeOperatorEntryList(
	existing: TDOperatorEntry[],
	incoming: TDOperatorEntry[],
): TDOperatorEntry[] {
	const byId = new Map<string, TDOperatorEntry>();
	for (const entry of existing) {
		byId.set(entry.id, entry);
	}
	for (const entry of incoming) {
		const previous = byId.get(entry.id);
		byId.set(
			entry.id,
			previous ? mergeOperatorEntries(previous, entry) : entry,
		);
	}
	return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function operatorEntryIdFromOpType(opType: string): string {
	const trimmed = opType.trim();
	const suffix = OP_FAMILY_SUFFIXES.find((candidate) =>
		trimmed.toUpperCase().endsWith(candidate),
	);
	if (!suffix) return slugify(trimmed);

	const stem = trimmed.slice(0, -suffix.length);
	return `${slugify(stem)}-${suffix.toLowerCase()}`.replace(/^-+/, "");
}

function slugify(value: string): string {
	return (
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "operator"
	);
}

function pickTextEntry(
	a: TDOperatorEntry,
	b: TDOperatorEntry,
): TDOperatorEntry {
	if (TEXT_PROVENANCE.has(b.provenance.source)) return b;
	if (TEXT_PROVENANCE.has(a.provenance.source)) return a;
	return b;
}

function pickFactEntry(
	a: TDOperatorEntry,
	b: TDOperatorEntry,
): TDOperatorEntry {
	if (b.provenance.source === "runtime-introspection") return b;
	if (a.provenance.source === "runtime-introspection") return a;
	return b;
}

function mergeParameters(
	textParams: TDOperatorEntry["payload"]["parameters"],
	factParams: TDOperatorEntry["payload"]["parameters"],
): TDOperatorEntry["payload"]["parameters"] {
	const byKey = new Map<string, (typeof textParams)[number]>();
	for (const par of factParams) {
		byKey.set(parameterKey(par), { ...par });
	}
	for (const par of textParams) {
		const key = parameterKey(par);
		byKey.set(key, {
			...(byKey.get(key) ?? {}),
			...par,
			description: par.description ?? byKey.get(key)?.description,
		});
	}
	return [...byKey.values()];
}

function parameterKey(
	par: TDOperatorEntry["payload"]["parameters"][number],
): string {
	return (par.name || par.label || "").toLowerCase();
}

function unionStrings(a: string[], b: string[]): string[] {
	return [...new Set([...a, ...b].filter(Boolean))];
}
