import type { KnowledgeRegistry } from "../resources/registry.js";
import type { TDLessonEntry } from "../resources/types.js";

// ── Types ──────────────────────────────────────────────────────────

export interface ScanOperator {
	family: string;
	opType: string;
	path: string;
}

export interface ScanConnection {
	from: string;
	fromOutput: number;
	to: string;
	toInput: number;
}

export interface ScanAnomaly {
	detail: string;
	path: string;
	type: string;
}

export interface ScanError {
	message: string;
	path: string;
}

export interface ScanData {
	anomalies: ScanAnomaly[];
	connections: ScanConnection[];
	errors: ScanError[];
	operators: ScanOperator[];
}

export interface LessonCandidate {
	category: "pattern" | "pitfall";
	confidence: "low" | "medium";
	matchesExisting?: string;
	operatorChain: Array<{ family: string; opType: string }>;
	summary: string;
	tags: string[];
	title: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function opTypeAt(
	path: string,
	opMap: Map<string, ScanOperator>,
): string | undefined {
	return opMap.get(path)?.opType;
}

function findExistingMatch(
	candidate: LessonCandidate,
	registry: KnowledgeRegistry,
): string | undefined {
	const lessons = registry.getByKind("lesson") as TDLessonEntry[];
	for (const lesson of lessons) {
		const lessonOps = lesson.payload.operatorChain ?? [];
		const candOps = candidate.operatorChain;
		// Match if same category and overlapping operator types
		if (lesson.payload.category !== candidate.category) continue;
		const lessonTypes = new Set(lessonOps.map((o) => o.opType));
		const overlap = candOps.filter((o) => lessonTypes.has(o.opType));
		if (overlap.length >= Math.min(candOps.length, lessonTypes.size, 2)) {
			return lesson.id;
		}
	}
	return undefined;
}

// ── Detection Rules ────────────────────────────────────────────────

function detectFeedbackLoops(
	data: ScanData,
	opMap: Map<string, ScanOperator>,
): LessonCandidate[] {
	const candidates: LessonCandidate[] = [];
	const feedbackOps = data.operators.filter((o) => o.opType === "feedbackTOP");

	for (const fb of feedbackOps) {
		// Find what's connected to the feedback TOP
		const inputsToFb = data.connections.filter((c) => c.to === fb.path);
		const outputsFromFb = data.connections.filter((c) => c.from === fb.path);

		if (inputsToFb.length === 0 && outputsFromFb.length === 0) continue;

		const chain: Array<{ family: string; opType: string }> = [
			{ family: "TOP", opType: "feedbackTOP" },
		];

		// Collect connected operator types
		for (const conn of [...inputsToFb, ...outputsFromFb]) {
			const otherPath = conn.to === fb.path ? conn.from : conn.to;
			const otherType = opTypeAt(otherPath, opMap);
			if (otherType && !chain.some((c) => c.opType === otherType)) {
				chain.push({ family: "TOP", opType: otherType });
			}
		}

		const hasGlsl = chain.some((c) => c.opType === "glslTOP");
		const hasDisplace = chain.some((c) => c.opType === "displaceTOP");

		let title = "Feedback Loop";
		const tags = ["feedback"];
		if (hasGlsl) {
			title = "GLSL + Feedback Loop";
			tags.push("glsl");
		}
		if (hasDisplace) {
			title = "Feedback + Displace";
			tags.push("displace", "organic");
		}

		candidates.push({
			category: "pattern",
			confidence: "medium",
			operatorChain: chain,
			summary: `Detected feedback loop involving ${chain.map((c) => c.opType).join(" → ")}`,
			tags,
			title,
		});
	}

	return candidates;
}

function detectInstancing(data: ScanData): LessonCandidate[] {
	const instancing = data.anomalies.filter((a) => a.type === "instancing");
	return instancing.map((a) => ({
		category: "pattern" as const,
		confidence: "medium" as const,
		operatorChain: [{ family: "COMP", opType: "geometryCOMP" }],
		summary: `Geometry COMP at ${a.path} uses GPU instancing (instanceCHOP: ${a.detail})`,
		tags: ["instancing", "geometry", "gpu"],
		title: "GPU Instancing Setup",
	}));
}

function detectChopExports(data: ScanData): LessonCandidate[] {
	const exports = data.anomalies.filter((a) => a.type === "chop_export");
	if (exports.length === 0) return [];

	return [
		{
			category: "pattern",
			confidence: "low",
			operatorChain: exports.map((a) => ({
				family: "CHOP",
				opType: opTypeFromPath(a.path, data) ?? "CHOP",
			})),
			summary: `${exports.length} CHOP(s) with active exports driving parameters`,
			tags: ["chop", "export", "data-driven"],
			title: "CHOP Export to Parameters",
		},
	];
}

function detectOrphans(data: ScanData): LessonCandidate[] {
	const orphans = data.anomalies.filter((a) => a.type === "orphan");
	if (orphans.length === 0) return [];

	return [
		{
			category: "pitfall",
			confidence: "low",
			operatorChain: orphans.slice(0, 5).map((a) => ({
				family: opFamilyFromPath(a.path, data) ?? "unknown",
				opType: opTypeFromPath(a.path, data) ?? "unknown",
			})),
			summary: `${orphans.length} disconnected operator(s) found — may be unused or accidentally disconnected`,
			tags: ["orphan", "cleanup", "disconnected"],
			title: "Disconnected Operators",
		},
	];
}

function detectErrors(data: ScanData): LessonCandidate[] {
	if (data.errors.length === 0) return [];

	return [
		{
			category: "pitfall",
			confidence: "medium",
			operatorChain: data.errors.slice(0, 5).map((e) => ({
				family: opFamilyFromPath(e.path, data) ?? "unknown",
				opType: opTypeFromPath(e.path, data) ?? "unknown",
			})),
			summary: `${data.errors.length} operator(s) in error state`,
			tags: ["error", "broken"],
			title: "Operators with Errors",
		},
	];
}

function opTypeFromPath(path: string, data: ScanData): string | undefined {
	return data.operators.find((o) => o.path === path)?.opType;
}

function opFamilyFromPath(path: string, data: ScanData): string | undefined {
	return data.operators.find((o) => o.path === path)?.family;
}

// ── Main Entry Point ───────────────────────────────────────────────

/**
 * Analyze scan data and detect lesson candidates.
 * Checks against existing lessons for deduplication.
 */
export function detectLessons(
	data: ScanData,
	registry: KnowledgeRegistry,
): LessonCandidate[] {
	const opMap = new Map(data.operators.map((o) => [o.path, o]));

	const candidates = [
		...detectFeedbackLoops(data, opMap),
		...detectInstancing(data),
		...detectChopExports(data),
		...detectOrphans(data),
		...detectErrors(data),
	];

	// Check for existing matches
	for (const candidate of candidates) {
		candidate.matchesExisting = findExistingMatch(candidate, registry);
	}

	return candidates;
}
