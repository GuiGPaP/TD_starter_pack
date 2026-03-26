import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { TDLessonEntry } from "../resources/types.js";

const LESSON_SIDECAR_SUFFIX = ".td-lessons";

/**
 * Write a lesson entry to the builtin knowledge base.
 * Creates the lessons/ subdirectory if needed.
 */
export function writeLessonToBuiltin(
	lesson: TDLessonEntry,
	knowledgePath: string,
): string {
	const dir = join(knowledgePath, "lessons");
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const filePath = join(dir, `${lesson.id}.json`);
	writeFileSync(filePath, JSON.stringify(lesson, null, "\t"), "utf-8");
	return filePath;
}

/**
 * Append a lesson to a project sidecar file ({name}.td-lessons.json).
 * Creates the file if it doesn't exist; appends to the array if it does.
 */
export function appendLessonToSidecar(
	lesson: TDLessonEntry,
	toePath: string,
): string {
	const name = basename(toePath, ".toe");
	const sidecarPath = join(
		dirname(toePath),
		`${name}${LESSON_SIDECAR_SUFFIX}.json`,
	);

	let lessons: TDLessonEntry[] = [];
	if (existsSync(sidecarPath)) {
		try {
			const raw = JSON.parse(readFileSync(sidecarPath, "utf-8"));
			lessons = Array.isArray(raw) ? raw : [raw];
		} catch {
			// Corrupt file — start fresh
			lessons = [];
		}
	}

	lessons.push(lesson);
	writeFileSync(sidecarPath, JSON.stringify(lessons, null, "\t"), "utf-8");
	return sidecarPath;
}
