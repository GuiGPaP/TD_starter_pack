/**
 * Import TouchDesigner operator documentation from dotsimulate's MCP server.
 *
 * Strategy: search exhaustively to discover all operator doc_ids,
 * then fetch full docs and convert to our operator JSON schema.
 *
 * Usage: DOTSIMULATE_TOKEN=xxx npx tsx scripts/importTdDocs.ts
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

// ── MCP JSON-RPC ──────────────────────────────────────────────────

let rpcId = 0;

async function mcpCall(
	method: string,
	params: Record<string, unknown>,
): Promise<unknown> {
	rpcId++;
	const res = await fetch(MCP_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${TOKEN}`,
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
	});
	const text = await res.text();
	const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
	if (!dataLine) throw new Error(`No data: ${text.slice(0, 200)}`);
	const json = JSON.parse(dataLine.slice(6));
	if (json.error) throw new Error(JSON.stringify(json.error));
	return json.result;
}

interface SearchResult {
	doc_id: string;
	operator?: string;
	content: string;
}

async function searchDocs(terms: string[], maxResults = 50): Promise<SearchResult[]> {
	const result = (await mcpCall("tools/call", {
		name: "search_touchdesigner_docs",
		arguments: { search_terms: terms, max_results: maxResults },
	})) as { content: Array<{ text: string }> };
	return JSON.parse(result.content[0].text).results;
}

async function getFullDoc(docId: string) {
	const result = (await mcpCall("tools/call", {
		name: "get_full_touchdesigner_doc",
		arguments: { doc_id: docId },
	})) as { content: Array<{ text: string }> };
	return JSON.parse(result.content[0].text).doc;
}

// ── Phase 1: Exhaustive discovery ─────────────────────────────────

async function discoverAllOperators(): Promise<Map<string, string>> {
	const operators = new Map<string, string>(); // doc_id → "opType family"

	// Strategy: search with every letter, common op names, families
	const queries = [
		// By family
		["TOP operator"], ["CHOP operator"], ["SOP operator"],
		["DAT operator"], ["COMP operator"], ["MAT operator"], ["POP operator"],
		// By common prefixes
		["noise"], ["audio"], ["feedback"], ["render"], ["texture"],
		["math"], ["filter"], ["transform"], ["select"], ["null"],
		["constant"], ["merge"], ["switch"], ["copy"], ["delete"],
		["blend"], ["composite"], ["level"], ["lookup"], ["ramp"],
		["file in"], ["file out"], ["movie"], ["NDI"], ["OSC"],
		["MIDI"], ["serial"], ["timer"], ["script"], ["text"],
		["table"], ["GLSL"], ["point"], ["line"], ["circle"],
		["sphere"], ["box"], ["grid"], ["torus"], ["tube"],
		["curve"], ["extrude"], ["sweep"], ["font"], ["trace"],
		["sort"], ["limit"], ["spring"], ["lag"], ["speed"],
		["pattern"], ["wave"], ["beat"], ["analyze"], ["info"],
		["camera"], ["light"], ["geometry"], ["window"], ["container"],
		["base COMP"], ["button"], ["slider"], ["field"],
		["crop"], ["blur"], ["edge"], ["displace"], ["mirror"],
		["flip"], ["fit"], ["over"], ["inside"], ["outside"],
		["depth"], ["subtract"], ["multiply"], ["add"],
		["channel mix"], ["chroma key"], ["HSV"],
		["kinect"], ["leap motion"], ["oculus"], ["OpenVR"],
		["particle"], ["force"], ["attribute"], ["group"],
		["cache"], ["trail"], ["record"], ["hold"],
		["expression"], ["count"], ["logic"], ["trigger"],
		["join"], ["trim"], ["stretch"], ["resample"],
		["keyboard"], ["mouse"], ["panel"], ["joystick"],
		["DMX"], ["laser"], ["EtherDream"],
		["web render"], ["syphon spout"], ["shared mem"],
		["reorder"], ["rename"], ["replace"], ["convert"],
		["ZED"], ["Orbbec"], ["OAK"], ["RealSense"],
		["NVIDIA"], ["substance"], ["SVG"], ["photoshop"],
		["projection"], ["scalable display"], ["MPCDI"],
		["annotation"], ["replicator"], ["parameter COMP"],
		["PBR MAT"], ["phong MAT"], ["wireframe MAT"],
		["primitiv POP"], ["polygonize POP"], ["facet POP"],
		["proximity POP"], ["ray POP"], ["random POP"],
		["SOP to CHOP"], ["CHOP to TOP"], ["TOP to CHOP"],
		["DAT to CHOP"], ["CHOP to DAT"], ["SOP to POP"],
		["accumulate POP"], ["alembic"], ["histogram POP"],
		["import select"], ["cross TOP"], ["emboss TOP"],
		["monochrome TOP"], ["threshold TOP"], ["tile TOP"],
		["slope"], ["spectrum"], ["SSAO"], ["optical flow"],
		["time machine"], ["resolution TOP"],
		["skin POP"], ["revolve POP"], ["subdivide POP"],
		["normalize POP"], ["normal POP"], ["connectivity POP"],
		["quantize POP"], ["rerange POP"],
		["warp CHOP"], ["cycle CHOP"], ["envelope CHOP"],
		["clip CHOP"], ["splice CHOP"], ["shuffle CHOP"],
	];

	console.log(`Running ${queries.length} search queries...`);
	for (let i = 0; i < queries.length; i++) {
		try {
			const results = await searchDocs(queries[i], 50);
			for (const r of results) {
				if (r.operator && r.doc_id && !r.doc_id.includes("__content")) {
					operators.set(r.doc_id, r.operator);
				}
			}
		} catch (err) {
			console.error(`  Query ${queries[i]} failed:`, (err as Error).message);
		}

		// Rate limiting: small delay every 10 queries
		if (i > 0 && i % 10 === 0) {
			process.stdout.write(`  ${i}/${queries.length} queries, ${operators.size} operators found\r`);
			await new Promise((r) => setTimeout(r, 300));
		}
	}

	console.log(`\nDiscovered ${operators.size} unique operator doc_ids`);
	return operators;
}

// ── Phase 2: Fetch & convert ──────────────────────────────────────

interface ParsedParam {
	name: string;
	label?: string;
	style?: string;
	description?: string;
}

function parseParameters(content: string): ParsedParam[] {
	const params: ParsedParam[] = [];
	const regex = /\*\*(.+?)\*\*\s*\(`(.+?)`\)\s*-\s*Type:\s*(\w+)\n?(.*?)(?=\n\*\*|\n#|$)/gs;
	const seen = new Set<string>();
	let match: RegExpExecArray | null;

	while ((match = regex.exec(content)) !== null) {
		const name = match[2].trim();
		if (seen.has(name)) continue;
		seen.add(name);

		const style = match[3].replace(/^Par/, "").trim();
		const desc = match[4]?.trim().replace(/\n/g, " ").slice(0, 200);

		if (COMMON_PARAMS.has(name.toLowerCase())) continue;

		params.push({
			name,
			label: match[1].trim(),
			...(style ? { style } : {}),
			...(desc ? { description: desc } : {}),
		});
	}
	return params;
}

const COMMON_PARAMS = new Set([
	"outputresolution", "resmult", "outputaspect", "inputfiltertype",
	"fillmode", "filtertype", "npasses", "chanmask", "format",
	"parmcolorspace", "parmreferencewhite", "resolutionw", "resolutionh",
	"aspect1", "aspect2",
]);

function opTypeToId(opType: string): string {
	return opType
		.replace(/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/, (m) => `-${m.toLowerCase()}`)
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.replace(/--+/g, "-");
}

function opTypeToFamily(opType: string): string {
	const m = opType.match(/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/);
	return m ? m[1] : "COMP";
}

function extractSummary(content: string): string {
	const before = content.split("# Parameters")[0];
	const lines = before.split("\n").filter(
		(l) => l.trim() && !l.startsWith("#") && !l.startsWith("From Derivative"),
	);
	return lines.slice(0, 3).join(" ").trim().slice(0, 300) || "";
}

function generateKeywords(opType: string, params: ParsedParam[]): string[] {
	const family = opTypeToFamily(opType).toLowerCase();
	const name = opType.replace(/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/, "").toLowerCase();
	const kw = new Set([name, family, opType.toLowerCase()]);
	for (const p of params.slice(0, 5)) {
		if (p.name.length > 3) kw.add(p.name.toLowerCase());
	}
	return [...kw];
}

async function importOperator(docId: string): Promise<string | null> {
	try {
		const doc = await getFullDoc(docId);
		if (!doc?.operator) return null;

		const [opType] = doc.operator.split(" ");
		const family = doc.family || opTypeToFamily(opType);
		const id = opTypeToId(opType);
		const filePath = join(OUTPUT_DIR, `${id}.json`);

		const params = parseParameters(doc.content);
		const summary = extractSummary(doc.content);
		const keywords = generateKeywords(opType, params);

		// Preserve existing examples
		let existingExamples: unknown[] | undefined;
		if (existsSync(filePath)) {
			try {
				const existing = JSON.parse(readFileSync(filePath, "utf-8"));
				existingExamples = existing?.payload?.examples;
			} catch { /* ignore */ }
		}

		const entry = {
			id,
			title: doc.title?.replace(" - Derivative", "").replace(/\s+/g, " ").trim() || opType,
			kind: "operator",
			aliases: [] as string[],
			searchKeywords: keywords,
			content: {
				summary: summary || `TouchDesigner ${opType} operator.`,
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
		console.error(`  Error: ${docId}: ${(err as Error).message.slice(0, 80)}`);
		return null;
	}
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
	if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

	const operators = await discoverAllOperators();
	const docIds = [...operators.keys()];
	console.log(`\nImporting ${docIds.length} operators...`);

	let imported = 0;
	let failed = 0;

	for (let i = 0; i < docIds.length; i += 5) {
		const batch = docIds.slice(i, i + 5);
		const results = await Promise.all(batch.map(importOperator));
		for (const r of results) {
			if (r) imported++;
			else failed++;
		}

		if (i % 25 === 0) {
			process.stdout.write(`  ${imported} imported, ${failed} failed (${i}/${docIds.length})\r`);
		}
		if (i + 5 < docIds.length) {
			await new Promise((r) => setTimeout(r, 300));
		}
	}

	console.log(`\n\nDone: ${imported} imported, ${failed} failed`);
}

main().catch(console.error);
