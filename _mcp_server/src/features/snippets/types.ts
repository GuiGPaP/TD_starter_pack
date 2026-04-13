/**
 * Types for Operator Snippets extracted from TD's official examples.
 * These are NOT knowledge entries — they have a richer structure
 * with examples, operators, connections, and DAT contents.
 */

export interface SnippetOperator {
	name: string;
	opType: string;
	family: string;
	x: number;
	y: number;
	nonDefaultParams: Record<string, unknown>;
}

export interface SnippetConnection {
	from: string;
	fromOutput: number;
	to: string;
	toInput: number;
}

export interface SnippetDatContent {
	name: string;
	type: string;
	language: string;
	text: string;
}

export interface SnippetExport {
	name: string;
	text: string;
}

export interface SnippetExample {
	name: string;
	operators: SnippetOperator[];
	connections: SnippetConnection[];
	datContents: SnippetDatContent[];
	readMe: string | null;
	exports: SnippetExport[];
	warnings: string[];
}

export interface SnippetExtractionMeta {
	tdBuild: string;
	extractedAt: string;
	exampleCount: number;
	totalOpCount: number;
	totalConnectionCount: number;
	hasReadMe: boolean;
	warnings: string[];
}

export interface Snippet {
	id: string;
	filename: string;
	family: string;
	opType: string;
	examples: SnippetExample[];
	extractionMeta: SnippetExtractionMeta;
}

export interface FamilyData {
	family: string;
	tdBuild: string;
	extractedAt: string;
	snippetCount: number;
	successCount: number;
	failCount: number;
	elapsedSeconds: number;
	snippets: Snippet[];
	errors: Array<{ filename: string; error: string }>;
}

export interface SnippetIndexEntry {
	family: string;
	opType: string;
	filename: string;
	exampleCount: number;
	opTypes: string[];
	readMePreview: string | null;
	totalOps: number;
	totalConnections: number;
	hasExports: boolean;
	hasDatCode: boolean;
}

export interface SnippetIndex {
	version: string;
	tdBuild: string;
	generatedAt: string;
	stats: {
		totalSnippets: number;
		totalExamples: number;
		totalOps: number;
		totalConnections: number;
		uniqueOpTypes: number;
		withReadme: number;
		tipCount: number;
	};
	snippets: Record<string, SnippetIndexEntry>;
	opTypeIndex: Record<
		string,
		{
			family: string;
			appearanceCount: number;
			snippetIds: string[];
		}
	>;
}

export interface SnippetTip {
	snippetId: string;
	family: string;
	exampleName: string;
	category: string;
	text: string;
}

export interface SnippetAnalysis {
	version: string;
	generatedAt: string;
	recurringParams: Record<
		string,
		{
			family: string;
			totalAppearances: number;
			recurringParams: Record<
				string,
				{
					count: number;
					frequency: string;
					topValues: Array<{ value: string; count: number }>;
				}
			>;
		}
	>;
	tips: SnippetTip[];
	themes: Record<
		string,
		{
			snippetCount: number;
			tipCount: number;
			snippetIds: string[];
		}
	>;
	topConnectionPatterns: Array<{
		pair: string;
		count: number;
		snippetCount: number;
	}>;
}
