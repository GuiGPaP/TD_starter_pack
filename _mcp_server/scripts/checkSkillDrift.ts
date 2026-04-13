/**
 * CI skill drift detection — verifies that:
 * 1. Tool names referenced in SKILL.md files exist in TOOL_NAMES (constants.ts)
 * 2. Parameter names used in operator examples exist in the operator's parameters array
 *
 * Usage: npx tsx scripts/checkSkillDrift.ts
 * Exit code 0 = clean, 1 = drift detected
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_NAMES } from "../src/core/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../../.claude/skills");
const OPERATORS_DIR = path.resolve(
	__dirname,
	"../data/td-knowledge/operators",
);

const validToolNames = new Set(Object.values(TOOL_NAMES));
let errors = 0;
let warnings = 0;

// ── Rule 1: Tool names in SKILL.md must exist in TOOL_NAMES ──

function checkToolReferences() {
	console.log("## Rule 1: Tool name references in SKILL.md\n");

	const skillDirs = fs.readdirSync(SKILLS_DIR).filter((d) => {
		const p = path.join(SKILLS_DIR, d);
		return fs.statSync(p).isDirectory();
	});

	for (const dir of skillDirs) {
		const skillFile = path.join(SKILLS_DIR, dir, "SKILL.md");
		if (!fs.existsSync(skillFile)) continue;

		const content = fs.readFileSync(skillFile, "utf8");

		// Extract backtick-quoted tool names from markdown tables and text
		// Pattern: `tool_name` where tool_name looks like a snake_case identifier
		const toolRefs = new Set<string>();
		const regex = /`([a-z][a-z0-9_]+)`/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(content)) !== null) {
			const name = match[1];
			// Filter: only consider names that look like MCP tool names
			// (snake_case, no dots, not a parameter name like "par.xxx")
			if (
				name.includes(".") ||
				name.startsWith("par_") ||
				name.length < 4
			)
				continue;
			// Skip known non-tool identifiers
			if (
				[
					"read_only",
					"safe_write",
					"full_exec",
					"script_chop",
					"script_dat",
					"true",
					"false",
					"null",
				].includes(name)
			)
				continue;
			toolRefs.add(name);
		}

		let fileErrors = 0;
		for (const ref of toolRefs) {
			if (!validToolNames.has(ref)) {
				// Check if it's plausibly a tool name (contains common prefixes)
				const looksLikeTool =
					ref.startsWith("search_") ||
					ref.startsWith("get_") ||
					ref.startsWith("set_") ||
					ref.startsWith("create_") ||
					ref.startsWith("deploy_") ||
					ref.startsWith("list_") ||
					ref.startsWith("lint_") ||
					ref.startsWith("format_") ||
					ref.startsWith("validate_") ||
					ref.startsWith("connect_") ||
					ref.startsWith("copy_") ||
					ref.startsWith("delete_") ||
					ref.startsWith("update_") ||
					ref.startsWith("index_") ||
					ref.startsWith("export_") ||
					ref.startsWith("exec_") ||
					ref.startsWith("scan_") ||
					ref.startsWith("configure_") ||
					ref.startsWith("complete_") ||
					ref.startsWith("layout_") ||
					ref.startsWith("typecheck_") ||
					ref.startsWith("discover_") ||
					ref.startsWith("undo_") ||
					ref.startsWith("wait_") ||
					ref.startsWith("suggest_") ||
					ref.startsWith("bulk_") ||
					ref.startsWith("capture_") ||
					ref.startsWith("load_") ||
					ref.startsWith("package_") ||
					ref.startsWith("screenshot_") ||
					ref.startsWith("compare_");

				if (looksLikeTool) {
					console.log(
						`  ❌ ${dir}/SKILL.md: unknown tool \`${ref}\``,
					);
					fileErrors++;
					errors++;
				}
			}
		}

		if (fileErrors === 0) {
			console.log(`  ✓ ${dir}/SKILL.md — all tool references valid`);
		}
	}
	console.log("");
}

// ── Rule 2: Parameter names in operator examples must match parameters array ──

function checkOperatorExamples() {
	console.log("## Rule 2: Parameter names in operator examples\n");

	const files = fs
		.readdirSync(OPERATORS_DIR)
		.filter((f) => f.endsWith(".json"));

	let checked = 0;
	let clean = 0;

	for (const file of files) {
		const data = JSON.parse(
			fs.readFileSync(path.join(OPERATORS_DIR, file), "utf8"),
		);
		const examples = data.payload?.examples;
		const params = data.payload?.parameters;
		if (!examples?.length || !params?.length) continue;

		checked++;
		const validParamNames = new Set(
			params.map((p: { name: string }) => p.name),
		);

		// TD common parameters not always in our doc schemas
		const TD_COMMON_PARAMS = new Set([
			"pageindex", "outputresolution", "resolutionw", "resolutionh",
			"resmult", "format", "filtertype", "channames", "chop", "chops",
		]);

		let fileClean = true;
		for (const ex of examples) {
			if (ex.language !== "python" || !ex.code) continue;

			// Extract n.par.xxx or op(...).par.xxx references
			const parRefs =
				ex.code.match(/\.par\.([a-zA-Z][a-zA-Z0-9_]*)/g) || [];
			for (const ref of parRefs) {
				const paramName = ref.replace(".par.", "");
				// Skip well-known TD common params not in our schemas
				if (TD_COMMON_PARAMS.has(paramName)) continue;
				// Skip sequence params (name0, value0, etc. — could be name1, name2...)
				if (/\d+$/.test(paramName)) {
					const baseName = paramName.replace(/\d+$/, "");
					// Check if base + any digit exists
					const hasSequence = [...validParamNames].some(
						(p) =>
							p === paramName ||
							p.replace(/\d+$/, "") === baseName,
					);
					if (hasSequence) continue;
				}
				if (!validParamNames.has(paramName)) {
					console.log(
						`  ⚠ ${file}: example uses \`par.${paramName}\` but parameter not in schema`,
					);
					warnings++;
					fileClean = false;
				}
			}
		}

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
console.log(
	`Results: ${errors} error(s), ${warnings} warning(s)`,
);
process.exit(errors > 0 ? 1 : 0);
