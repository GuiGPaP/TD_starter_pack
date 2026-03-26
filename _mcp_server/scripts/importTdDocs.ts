/**
 * Import TouchDesigner operator documentation from dotsimulate's MCP server
 * into our local knowledge base (data/td-knowledge/operators/).
 *
 * Usage: npx tsx scripts/importTdDocs.ts
 *
 * Requires DOTSIMULATE_TOKEN env var (Bearer JWT token).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MCP_URL = "https://context-mcp.dotsimulate.com/mcp/";
const TOKEN = process.env.DOTSIMULATE_TOKEN;
if (!TOKEN) {
	console.error("Set DOTSIMULATE_TOKEN env var");
	process.exit(1);
}

const OUTPUT_DIR = join(
	fileURLToPath(import.meta.url),
	"../../data/td-knowledge/operators",
);

// ── MCP JSON-RPC helpers ──────────────────────────────────────────

let rpcId = 0;

async function mcpCall(
	method: string,
	params: Record<string, unknown>,
): Promise<unknown> {
	rpcId++;
	const body = JSON.stringify({
		jsonrpc: "2.0",
		id: rpcId,
		method,
		params,
	});

	const res = await fetch(MCP_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${TOKEN}`,
		},
		body,
	});

	const text = await res.text();
	// Response is SSE format: "event: message\ndata: {...}"
	const dataLine = text
		.split("\n")
		.find((l) => l.startsWith("data: "));
	if (!dataLine) throw new Error(`No data in response: ${text.slice(0, 200)}`);
	const json = JSON.parse(dataLine.slice(6));
	if (json.error) throw new Error(JSON.stringify(json.error));
	return json.result;
}

async function searchDocs(
	terms: string[],
	maxResults = 50,
): Promise<Array<{ doc_id: string; operator?: string; content: string }>> {
	const result = (await mcpCall("tools/call", {
		name: "search_touchdesigner_docs",
		arguments: { search_terms: terms, max_results: maxResults },
	})) as { content: Array<{ text: string }> };

	const parsed = JSON.parse(result.content[0].text);
	return parsed.results;
}

async function getFullDoc(docId: string): Promise<{
	content: string;
	title: string;
	doc_id: string;
	operator?: string;
	family?: string;
}> {
	const result = (await mcpCall("tools/call", {
		name: "get_full_touchdesigner_doc",
		arguments: { doc_id: docId },
	})) as { content: Array<{ text: string }> };

	const parsed = JSON.parse(result.content[0].text);
	return parsed.doc;
}

// ── Parsing helpers ───────────────────────────────────────────────

interface ParsedParam {
	name: string;
	label?: string;
	style?: string;
	description?: string;
}

function parseParameters(content: string): ParsedParam[] {
	const params: ParsedParam[] = [];
	const regex =
		/\*\*(.+?)\*\*\s*\(`(.+?)`\)\s*-\s*Type:\s*(\w+)\n?(.*?)(?=\n\*\*|\n#|$)/gs;
	let match: RegExpExecArray | null;
	const seen = new Set<string>();

	while ((match = regex.exec(content)) !== null) {
		const name = match[2].trim();
		if (seen.has(name)) continue; // skip duplicates (common page params)
		seen.add(name);

		const style = match[3]
			.replace(/^Par/, "")
			.trim();
		const desc = match[4]?.trim().replace(/\n/g, " ").slice(0, 200);

		// Skip common page params that are on every operator
		if (isCommonParam(name)) continue;

		params.push({
			name,
			label: match[1].trim(),
			style: style || undefined,
			description: desc || undefined,
		});
	}

	return params;
}

const COMMON_PARAMS = new Set([
	"outputresolution",
	"resmult",
	"outputaspect",
	"inputfiltertype",
	"fillmode",
	"filtertype",
	"npasses",
	"chanmask",
	"format",
	"parmcolorspace",
	"parmreferencewhite",
	"resolutionw",
	"resolutionh",
	"aspect1",
	"aspect2",
]);

function isCommonParam(name: string): boolean {
	return COMMON_PARAMS.has(name.toLowerCase());
}

function opTypeToId(opType: string): string {
	// noiseTOP → noise-top, audiodeviceinCHOP → audiodevicein-chop
	return opType
		.replace(/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/, (m) => `-${m.toLowerCase()}`)
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.replace(/--+/g, "-");
}

function opTypeToFamily(opType: string): string {
	const match = opType.match(/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/);
	return match ? match[1] : "COMP";
}

function opTypeToTitle(opType: string): string {
	const family = opTypeToFamily(opType);
	const name = opType.replace(/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/, "");
	// Split camelCase
	const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
	return `${spaced} ${family}`;
}

function extractSummary(content: string): string {
	// Try to get first paragraph before # Parameters
	const before = content.split("# Parameters")[0];
	const lines = before
		.split("\n")
		.filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("From Derivative"));
	return lines.slice(0, 3).join(" ").trim().slice(0, 300) || `TouchDesigner ${opTypeToTitle("")} operator.`;
}

function generateSearchKeywords(opType: string, params: ParsedParam[]): string[] {
	const family = opTypeToFamily(opType).toLowerCase();
	const name = opType
		.replace(/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/, "")
		.toLowerCase();
	const keywords = new Set([name, family, opType.toLowerCase()]);

	// Add some param names as keywords
	for (const p of params.slice(0, 5)) {
		if (p.name.length > 3) keywords.add(p.name.toLowerCase());
	}

	return [...keywords];
}

// ── Main import logic ─────────────────────────────────────────────

interface ExistingEntry {
	examples?: unknown[];
	[key: string]: unknown;
}

async function importOperator(docId: string): Promise<string | null> {
	try {
		const doc = await getFullDoc(docId);
		if (!doc.operator) return null;

		const [opType] = doc.operator.split(" ");
		const family = doc.family || opTypeToFamily(opType);
		const id = opTypeToId(opType);
		const filePath = join(OUTPUT_DIR, `${id}.json`);

		const params = parseParameters(doc.content);
		const summary = extractSummary(doc.content);
		const keywords = generateSearchKeywords(opType, params);

		// Check if file exists (preserve examples)
		let existingExamples: unknown[] | undefined;
		if (existsSync(filePath)) {
			try {
				const existing: ExistingEntry = JSON.parse(
					readFileSync(filePath, "utf-8"),
				);
				existingExamples = (existing as { payload?: { examples?: unknown[] } })
					?.payload?.examples;
			} catch {
				// ignore parse errors
			}
		}

		const entry = {
			id,
			title: doc.title?.replace(" - Derivative", "").trim() || opTypeToTitle(opType),
			kind: "operator",
			aliases: [] as string[],
			searchKeywords: keywords,
			content: {
				summary: summary || `TouchDesigner ${opTypeToTitle(opType)} operator.`,
			},
			provenance: {
				source: "td-docs",
				confidence: "high",
				license: "MIT",
			},
			payload: {
				opType,
				opFamily: family,
				parameters: params,
				...(existingExamples ? { examples: existingExamples } : {}),
				versions: {},
			},
		};

		writeFileSync(filePath, JSON.stringify(entry, null, "\t") + "\n");
		return id;
	} catch (err) {
		console.error(`  Error importing ${docId}:`, (err as Error).message);
		return null;
	}
}

async function discoverOperators(): Promise<string[]> {
	console.log("Discovering operators via category pages...");
	const docIds: string[] = [];

	// Fetch full category pages and parse operator names from the list
	const categoryDocIds = [
		"Category-TOPs__content",
		"Category-CHOPs__content",
		"Category-POPs__content",
		"Category-MATs__content",
	];

	const familySuffixes: Record<string, string> = {
		"Category-TOPs__content": "TOP",
		"Category-CHOPs__content": "CHOP",
		"Category-POPs__content": "POP",
		"Category-MATs__content": "MAT",
	};

	for (const catId of categoryDocIds) {
		const family = familySuffixes[catId];
		console.log(`  Parsing ${family} category...`);
		try {
			const doc = await getFullDoc(catId);
			// Extract operator names like "Noise TOP", "Feedback TOP" etc.
			const regex = new RegExp(`(\\w[\\w ]+?)\\s+${family}`, "g");
			let match: RegExpExecArray | null;
			while ((match = regex.exec(doc.content)) !== null) {
				const name = match[1].trim();
				if (name.startsWith("Experimental:") || name === "Introduction To" || name === "Category") continue;
				// Convert "Noise" + "TOP" → "noiseTOP"
				const opType = name.replace(/\s+/g, "").toLowerCase().replace(/^(.)/, (c) => c) + family;
				// doc_id format is typically the camelCase opType
				const camelName = name.replace(/\s+/g, "");
				const docIdGuess = `${camelName.charAt(0).toLowerCase()}${camelName.slice(1)}${family}`;
				docIds.push(docIdGuess);
			}
		} catch (err) {
			console.error(`  Error fetching ${catId}:`, (err as Error).message);
		}
	}

	// Also add known SOPs, DATs, COMPs by searching
	const extraFamilies = [
		{ terms: ["SOP operator parameters"], family: "SOP" },
		{ terms: ["DAT operator text table"], family: "DAT" },
		{ terms: ["COMP component base container geometry"], family: "COMP" },
	];
	for (const { terms, family } of extraFamilies) {
		console.log(`  Searching ${family}...`);
		const results = await searchDocs(terms, 50);
		for (const r of results) {
			if (r.operator && r.doc_id && !r.doc_id.includes("__content")) {
				docIds.push(r.doc_id);
			}
		}
	}

	// Deduplicate
	const unique = [...new Set(docIds)];
	console.log(`  Total unique doc_ids: ${unique.length}`);
	return unique;
}

async function main() {
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	const docIds = await discoverOperators();
	console.log(`Found ${docIds.length} operator doc_ids`);

	let imported = 0;
	let failed = 0;

	// Process in batches of 5 to avoid rate limiting
	for (let i = 0; i < docIds.length; i += 5) {
		const batch = docIds.slice(i, i + 5);
		console.log(
			`Batch ${Math.floor(i / 5) + 1}/${Math.ceil(docIds.length / 5)}: ${batch.join(", ")}`,
		);

		const results = await Promise.all(batch.map(importOperator));
		for (const r of results) {
			if (r) imported++;
			else failed++;
		}

		// Small delay between batches
		if (i + 5 < docIds.length) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	console.log(`\nDone: ${imported} imported, ${failed} failed`);
	console.log(`Total files in ${OUTPUT_DIR}: check with ls`);
}

main().catch(console.error);
