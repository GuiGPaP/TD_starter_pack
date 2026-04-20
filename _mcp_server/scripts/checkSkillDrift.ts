/**
 * CI skill drift detection verifies that:
 * 1. Tool names referenced in SKILL.md files exist in TOOL_NAMES (constants.ts)
 * 2. Parameter names used in bundled operator examples exist in the operator's
 *    parameters array, when a bundled operator corpus is present.
 *
 * Usage: npx tsx scripts/checkSkillDrift.ts
 * Exit code 0 = clean, 1 = drift detected
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_NAMES } from "../src/core/constants.js";

interface OperatorExample {
	code?: string;
	language?: string;
}

interface OperatorPayload {
	examples?: OperatorExample[];
	parameters?: Array<{ name: string }>;
}

interface OperatorEntry {
	payload?: OperatorPayload;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../../.claude/skills");
const OPERATORS_DIR = path.resolve(__dirname, "../data/td-knowledge/operators");

const IGNORED_BACKTICK_IDENTIFIERS = new Set([
	"false",
	"full_exec",
	"null",
	"read_only",
	"safe_write",
	"script_chop",
	"script_dat",
	"true",
]);

const TD_COMMON_PARAMS = new Set([
	"channames",
	"chop",
	"chops",
	"filtertype",
	"format",
	"outputresolution",
	"pageindex",
	"resmult",
	"resolutionh",
	"resolutionw",
]);

const TOOL_PREFIXES = [
	"bulk_",
	"capture_",
	"compare_",
	"complete_",
	"configure_",
	"connect_",
	"copy_",
	"create_",
	"delete_",
	"deploy_",
	"discover_",
	"exec_",
	"export_",
	"format_",
	"get_",
	"index_",
	"layout_",
	"lint_",
	"list_",
	"load_",
	"package_",
	"scan_",
	"screenshot_",
	"search_",
	"set_",
	"suggest_",
	"typecheck_",
	"undo_",
	"update_",
	"validate_",
] as const;

const validToolNames = new Set<string>(Object.values(TOOL_NAMES));
let errors = 0;
let warnings = 0;

function getSkillDirs(): string[] {
	if (!fs.existsSync(SKILLS_DIR)) {
		console.log(`  ⚠ Skills directory not found: ${SKILLS_DIR}`);
		return [];
	}

	return fs
		.readdirSync(SKILLS_DIR)
		.filter((dir) => fs.statSync(path.join(SKILLS_DIR, dir)).isDirectory());
}

function isPotentialToolReference(name: string): boolean {
	return (
		name.length >= 4 &&
		!name.includes(".") &&
		!name.startsWith("par_") &&
		!IGNORED_BACKTICK_IDENTIFIERS.has(name)
	);
}

function extractBacktickToolReferences(content: string): Set<string> {
	const refs = new Set<string>();

	for (const match of content.matchAll(/`([a-z][a-z0-9_]+)`/g)) {
		const name = match[1];
		if (isPotentialToolReference(name)) {
			refs.add(name);
		}
	}

	return refs;
}

function looksLikeToolName(name: string): boolean {
	return TOOL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function checkSkillToolReferences(dir: string): void {
	const skillFile = path.join(SKILLS_DIR, dir, "SKILL.md");
	if (!fs.existsSync(skillFile)) return;

	const content = fs.readFileSync(skillFile, "utf8");
	const toolRefs = extractBacktickToolReferences(content);
	let fileErrors = 0;

	for (const ref of toolRefs) {
		if (validToolNames.has(ref) || !looksLikeToolName(ref)) continue;

		console.log(`  ❌ ${dir}/SKILL.md: unknown tool \`${ref}\``);
		fileErrors++;
		errors++;
	}

	if (fileErrors === 0) {
		console.log(`  ✓ ${dir}/SKILL.md — all tool references valid`);
	}
}

// ── Rule 1: Tool names in SKILL.md must exist in TOOL_NAMES ──

function checkToolReferences(): void {
	console.log("## Rule 1: Tool name references in SKILL.md\n");

	for (const dir of getSkillDirs()) {
		checkSkillToolReferences(dir);
	}

	console.log("");
}

function getOperatorFiles(): string[] {
	if (!fs.existsSync(OPERATORS_DIR)) {
		console.log(
			"  Operator corpus not present; skipping example drift check.\n",
		);
		return [];
	}

	return fs.readdirSync(OPERATORS_DIR).filter((file) => file.endsWith(".json"));
}

function readOperatorEntry(file: string): OperatorEntry {
	const filePath = path.join(OPERATORS_DIR, file);
	return JSON.parse(fs.readFileSync(filePath, "utf8")) as OperatorEntry;
}

function extractParameterRefs(code: string): string[] {
	return [...code.matchAll(/\.par\.([a-zA-Z][a-zA-Z0-9_]*)/g)].map(
		(match) => match[1],
	);
}

function hasSequenceParam(
	paramName: string,
	validParamNames: ReadonlySet<string>,
): boolean {
	if (!/\d+$/.test(paramName)) return false;

	const baseName = paramName.replace(/\d+$/, "");
	return [...validParamNames].some(
		(param) => param === paramName || param.replace(/\d+$/, "") === baseName,
	);
}

function isKnownParameter(
	paramName: string,
	validParamNames: ReadonlySet<string>,
): boolean {
	return (
		TD_COMMON_PARAMS.has(paramName) ||
		validParamNames.has(paramName) ||
		hasSequenceParam(paramName, validParamNames)
	);
}

function checkExampleParamRefs(
	file: string,
	examples: OperatorExample[],
	validParamNames: ReadonlySet<string>,
): boolean {
	let fileClean = true;

	for (const example of examples) {
		if (example.language !== "python" || !example.code) continue;

		for (const paramName of extractParameterRefs(example.code)) {
			if (isKnownParameter(paramName, validParamNames)) continue;

			console.log(
				`  ⚠ ${file}: example uses \`par.${paramName}\` but parameter not in schema`,
			);
			warnings++;
			fileClean = false;
		}
	}

	return fileClean;
}

function checkOperatorFile(file: string): boolean | null {
	const data = readOperatorEntry(file);
	const examples = data.payload?.examples;
	const params = data.payload?.parameters;

	if (!examples?.length || !params?.length) return null;

	const validParamNames = new Set(params.map((param) => param.name));
	return checkExampleParamRefs(file, examples, validParamNames);
}

// ── Rule 2: Parameter names in operator examples must match parameters array ──

function checkOperatorExamples(): void {
	console.log("## Rule 2: Parameter names in operator examples\n");

	let checked = 0;
	let clean = 0;

	for (const file of getOperatorFiles()) {
		const fileClean = checkOperatorFile(file);
		if (fileClean === null) continue;

		checked++;
		if (fileClean) clean++;
	}

	console.log(
		`  Checked ${checked} operators with examples, ${clean} clean, ${checked - clean} with warnings\n`,
	);
}

// ── Main ──

console.log("# Skill Drift Detection\n");
checkToolReferences();
checkOperatorExamples();

console.log("---");
console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
