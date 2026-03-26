import type { TDLessonEntry } from "../resources/types.js";

interface SkillUpdateProposal {
	proposedAddition: string;
	section: string;
	status: "proposed" | "approved" | "applied" | "rejected";
	targetFile: string;
}

const GLSL_TAGS = new Set([
	"glsl",
	"shader",
	"pixel",
	"vertex",
	"fragment",
	"compute",
	"gpu",
	"texture",
]);

const PYTHON_TAGS = new Set([
	"python",
	"script",
	"extension",
	"callback",
	"dat",
]);

/**
 * Generate a skill update proposal from a lesson entry.
 * Maps lesson tags and operator families to the appropriate skill file and section.
 */
export function generateSkillProposal(
	lesson: TDLessonEntry,
): SkillUpdateProposal | undefined {
	const tags = new Set(lesson.payload.tags.map((t) => t.toLowerCase()));
	const families = new Set(
		(lesson.payload.operatorChain ?? []).map((o) => o.family.toUpperCase()),
	);

	// Determine target skill file
	let targetFile: string | undefined;

	if ([...tags].some((t) => GLSL_TAGS.has(t))) {
		targetFile = "td-glsl";
	} else if ([...tags].some((t) => PYTHON_TAGS.has(t))) {
		targetFile = "td-python";
	} else if (
		families.has("CHOP") ||
		families.has("SOP") ||
		families.has("TOP")
	) {
		targetFile = "td-guide";
	}

	if (!targetFile) return undefined;

	// Build the proposed addition text
	const prefix = lesson.payload.category === "pitfall" ? "⚠️" : "✅";
	const lines = [`${prefix} **${lesson.title}** — ${lesson.content.summary}`];

	if (lesson.payload.category === "pitfall" && lesson.payload.fix) {
		lines.push(`  Fix: ${lesson.payload.fix}`);
	}

	return {
		proposedAddition: lines.join("\n"),
		section: "Critical Guardrails",
		status: "proposed",
		targetFile,
	};
}
