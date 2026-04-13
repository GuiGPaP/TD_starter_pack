/**
 * Auto-enrich operator JSON files with examples derived from
 * Operator Snippets analysis data (snippets_analysis.json).
 *
 * Only targets operators that have NO existing examples.
 * Uses recurring parameter patterns (frequency ≥ 20%) and top values
 * from real Derivative .tox projects to generate realistic code examples.
 *
 * Usage: npx tsx scripts/enrichOperatorExamples.ts [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes("--dry-run");
const MIN_FREQUENCY_PCT = 20;
const MAX_EXAMPLES = 3;

const OPERATORS_DIR = path.resolve(
	__dirname,
	"../data/td-knowledge/operators",
);
const ANALYSIS_PATH = path.resolve(
	__dirname,
	"../../snippets_data/snippets_analysis.json",
);
const INDEX_PATH = path.resolve(
	__dirname,
	"../../snippets_data/snippets_index.json",
);

interface ParamPattern {
	count: number;
	frequency: string;
	topValues: Array<{ value: string; count: number }>;
}

interface OpAnalysis {
	family: string;
	totalAppearances: number;
	recurringParams: Record<string, ParamPattern>;
}

interface SnippetEntry {
	family: string;
	primaryOpType: string;
	readMePreview?: string;
}

interface OperatorExample {
	label: string;
	language: string;
	code: string;
	context: string;
	description?: string;
}

function frequencyPct(freq: string): number {
	return Number.parseInt(freq.replace("%", ""), 10);
}

/** Convert opType like "noiseTOP" to a short variable name like "noise1" */
function opVarName(opType: string): string {
	// Remove family suffix (TOP, CHOP, SOP, DAT, COMP, MAT, POP)
	const base = opType.replace(
		/(TOP|CHOP|SOP|DAT|COMP|MAT|POP)$/,
		"",
	);
	return `${base.toLowerCase()}1`;
}

/** Format a parameter value for Python code */
function pyValue(value: string, paramStyle?: string): string {
	if (value === "true") return "True";
	if (value === "false") return "False";
	// If it's a number, keep as-is
	if (/^-?\d+(\.\d+)?$/.test(value)) return value;
	// Otherwise, quote it
	return `'${value}'`;
}

function generateExamples(
	opType: string,
	analysis: OpAnalysis,
	operatorParams: Array<{ name: string; style: string; label: string; description: string }>,
	readMePreview?: string,
): OperatorExample[] {
	const examples: OperatorExample[] = [];
	const varName = opVarName(opType);

	// Filter out params whose top values are snippet-internal paths or noise
	const isUsableValue = (v: string) =>
		!v.includes("/snippets_tmp/") &&
		!v.includes("/project1/") &&
		v.length < 60;

	// Collect params with sufficient frequency and usable values
	const significantParams = Object.entries(analysis.recurringParams)
		.filter(([, p]) => {
			if (frequencyPct(p.frequency) < MIN_FREQUENCY_PCT) return false;
			// At least one top value must be usable
			return p.topValues.some((v) => isUsableValue(v.value));
		})
		.map(([name, p]) => {
			// Filter topValues to only usable ones
			return [name, { ...p, topValues: p.topValues.filter((v) => isUsableValue(v.value)) }] as const;
		})
		.filter(([, p]) => p.topValues.length > 0)
		.sort((a, b) => frequencyPct(b[1].frequency) - frequencyPct(a[1].frequency));

	if (significantParams.length === 0) return [];

	// Find param metadata from operator file for better labels
	const paramMap = new Map(operatorParams.map((p) => [p.name, p]));

	// Example 1: Set the top 2-3 most common parameters
	const setParams = significantParams.slice(0, 3);
	if (setParams.length > 0) {
		const lines = [`n = op('${varName}')`];
		const paramLabels: string[] = [];
		for (const [paramName, paramData] of setParams) {
			const topVal = paramData.topValues[0]?.value;
			if (!topVal) continue;
			const meta = paramMap.get(paramName);
			lines.push(`n.par.${paramName} = ${pyValue(topVal, meta?.style)}`);
			paramLabels.push(meta?.label ?? paramName);
		}
		if (lines.length > 1) {
			examples.push({
				label: `Configure ${paramLabels.slice(0, 2).join(" and ")}`,
				language: "python",
				code: lines.join("\n"),
				context: "textport",
				description: `Common settings from ${analysis.totalAppearances} real Derivative examples`,
			});
		}
	}

	// Example 2: Read/query a value
	const readableParam = significantParams.find(([, p]) => {
		const style = paramMap.get(p.count.toString())?.style;
		return style !== "Pulse"; // Skip pulse params for reads
	});
	if (readableParam) {
		const [paramName] = readableParam;
		const meta = paramMap.get(paramName);
		const label = meta?.label ?? paramName;
		examples.push({
			label: `Read ${label} value`,
			language: "python",
			code: `n = op('${varName}')\nprint(n.par.${paramName}.eval())`,
			context: "textport",
		});
	}

	// Example 3: If we have a readMe or multiple param variations, show alternative config
	if (significantParams.length >= 2 && examples.length < MAX_EXAMPLES) {
		const altParams = significantParams.slice(0, 2);
		const lines = [`n = op('${varName}')`];
		for (const [paramName, paramData] of altParams) {
			// Use 2nd most common value if available, else first
			const altVal = paramData.topValues[1]?.value ?? paramData.topValues[0]?.value;
			if (!altVal) continue;
			const meta = paramMap.get(paramName);
			lines.push(`n.par.${paramName} = ${pyValue(altVal, meta?.style)}`);
		}
		if (lines.length > 1) {
			const desc = readMePreview
				? readMePreview.split("\n")[0].slice(0, 120)
				: undefined;
			examples.push({
				label: "Alternative configuration",
				language: "python",
				code: lines.join("\n"),
				context: "textport",
				...(desc ? { description: desc } : {}),
			});
		}
	}

	return examples.slice(0, MAX_EXAMPLES);
}

function main() {
	// Load snippets data
	if (!fs.existsSync(ANALYSIS_PATH)) {
		console.error(`❌ snippets_analysis.json not found at ${ANALYSIS_PATH}`);
		process.exit(1);
	}
	if (!fs.existsSync(INDEX_PATH)) {
		console.error(`❌ snippets_index.json not found at ${INDEX_PATH}`);
		process.exit(1);
	}

	const analysis: { recurringParams: Record<string, OpAnalysis> } =
		JSON.parse(fs.readFileSync(ANALYSIS_PATH, "utf8"));
	const index: { snippets: Record<string, SnippetEntry> } =
		JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));

	// Build readMe lookup by primaryOpType
	const readMeByOpType = new Map<string, string>();
	for (const snippet of Object.values(index.snippets)) {
		if (snippet.readMePreview && !readMeByOpType.has(snippet.primaryOpType)) {
			readMeByOpType.set(snippet.primaryOpType, snippet.readMePreview);
		}
	}

	const files = fs.readdirSync(OPERATORS_DIR).filter((f) => f.endsWith(".json"));

	let enriched = 0;
	let skippedHasExamples = 0;
	let skippedNoMatch = 0;
	let skippedNoSignificant = 0;
	let totalExamplesAdded = 0;

	for (const file of files) {
		const filePath = path.join(OPERATORS_DIR, file);
		const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

		// Skip operators that already have examples
		if (data.payload?.examples?.length > 0) {
			skippedHasExamples++;
			continue;
		}

		const opType = data.payload?.opType;
		if (!opType) continue;

		// Find matching analysis data
		const opAnalysis = analysis.recurringParams[opType];
		if (!opAnalysis) {
			skippedNoMatch++;
			continue;
		}

		const readMe = readMeByOpType.get(opType);
		const operatorParams = data.payload?.parameters ?? [];

		const examples = generateExamples(opType, opAnalysis, operatorParams, readMe);
		if (examples.length === 0) {
			skippedNoSignificant++;
			continue;
		}

		// Write examples to operator file
		data.payload.examples = examples;

		if (!DRY_RUN) {
			fs.writeFileSync(filePath, JSON.stringify(data, null, "\t") + "\n");
		}

		enriched++;
		totalExamplesAdded += examples.length;

		if (enriched <= 5) {
			console.log(`  ✓ ${file}: ${examples.length} examples added`);
		}
	}

	console.log(`\n${DRY_RUN ? "🔍 DRY RUN — " : ""}Results:`);
	console.log(`  Enriched: ${enriched} operators (${totalExamplesAdded} examples)`);
	console.log(`  Skipped (has examples): ${skippedHasExamples}`);
	console.log(`  Skipped (no snippet match): ${skippedNoMatch}`);
	console.log(`  Skipped (no significant params): ${skippedNoSignificant}`);
	console.log(`  Total files: ${files.length}`);
}

main();
