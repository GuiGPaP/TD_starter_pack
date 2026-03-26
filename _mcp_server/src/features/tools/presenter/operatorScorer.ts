import type { TDKnowledgeEntry } from "../../resources/types.js";

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array(n + 1).fill(0),
	);
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
		}
	}
	return dp[m][n];
}

function scoreField(
	field: string,
	term: string,
	baseScore: number,
	exactBonus: number,
	startsWithBonus: number,
): number {
	const lower = field.toLowerCase();
	if (lower === term) return baseScore + exactBonus;
	if (lower.startsWith(term)) return baseScore + startsWithBonus;
	if (lower.includes(term)) return baseScore;

	// Fuzzy matching for terms > 3 chars
	if (term.length > 3) {
		const dist = levenshtein(lower, term);
		const maxDist = Math.floor(term.length / 3);
		if (dist <= maxDist) return Math.floor(baseScore * 0.5);
	}

	return 0;
}

/**
 * Score an operator knowledge entry against search terms.
 * Returns 0 if none of the terms match (AND logic).
 */
export function scoreOperator(
	entry: TDKnowledgeEntry,
	terms: string[],
): number {
	if (terms.length === 0) return 0;

	let totalScore = 0;

	for (const term of terms) {
		let bestTermScore = 0;

		// id / opType
		bestTermScore = Math.max(
			bestTermScore,
			scoreField(entry.id, term, 100, 50, 25),
		);
		if (entry.kind === "operator") {
			bestTermScore = Math.max(
				bestTermScore,
				scoreField(entry.payload.opType, term, 100, 50, 25),
			);
		}

		// title
		bestTermScore = Math.max(
			bestTermScore,
			scoreField(entry.title, term, 90, 0, 20),
		);

		// summary
		if (entry.content.summary.toLowerCase().includes(term)) {
			bestTermScore = Math.max(bestTermScore, 50);
		}

		// searchKeywords
		for (const kw of entry.searchKeywords) {
			bestTermScore = Math.max(bestTermScore, scoreField(kw, term, 30, 0, 0));
		}

		// aliases
		for (const alias of entry.aliases ?? []) {
			bestTermScore = Math.max(
				bestTermScore,
				scoreField(alias, term, 30, 50, 0),
			);
		}

		// opFamily
		if (entry.kind === "operator") {
			bestTermScore = Math.max(
				bestTermScore,
				scoreField(entry.payload.opFamily, term, 20, 0, 0),
			);
		}

		if (bestTermScore === 0) return 0; // AND: all terms must match
		totalScore += bestTermScore;
	}

	return totalScore;
}
