import { z } from "zod";

// ── Shared schemas ──────────────────────────────────────────────────

const provenanceSchema = z.object({
	confidence: z.enum(["high", "medium", "low"]),
	license: z.string(),
	source: z.enum(["skills-reference", "td-docs", "manual"]),
});

const contentSchema = z.object({
	summary: z.string(),
	warnings: z.array(z.string()).optional(),
});

const knowledgeEntryBaseSchema = z.object({
	aliases: z.array(z.string()).optional(),
	content: contentSchema,
	id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
	provenance: provenanceSchema,
	searchKeywords: z.array(z.string()),
	title: z.string(),
});

// ── Python module schemas ───────────────────────────────────────────

const moduleParameterSchema = z.object({
	default: z.string().optional(),
	description: z.string(),
	name: z.string(),
	type: z.string().optional(),
});

const exampleSchema = z.object({
	code: z.string(),
	label: z.string().optional(),
	language: z.string().default("python"),
});

const moduleMemberSchema = z.object({
	description: z.string(),
	examples: z.array(exampleSchema).optional(),
	name: z.string(),
	parameters: z.array(moduleParameterSchema).optional(),
	returns: z.string().optional(),
	signature: z.string().optional(),
	warnings: z.array(z.string()).optional(),
});

const pythonModulePayloadSchema = z.object({
	accessPattern: z.string().optional(),
	canonicalName: z.string(),
	members: z.array(moduleMemberSchema),
});

const pythonModuleEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("python-module"),
	payload: pythonModulePayloadSchema,
});

// ── Operator schemas ────────────────────────────────────────────────

const staticOperatorParamSchema = z.object({
	default: z.unknown().optional(),
	description: z.string().optional(),
	label: z.string().optional(),
	name: z.string(),
	style: z.string().optional(),
});

const operatorVersionSchema = z
	.object({
		addedIn: z.string().optional(),
		changedIn: z.array(z.string()).optional(),
		deprecated: z.boolean().optional(),
		deprecatedSince: z.string().optional(),
		removedIn: z.string().optional(),
		suggestedReplacement: z.string().optional(),
	})
	.optional();

const operatorExampleSchema = z.object({
	code: z.string(),
	context: z
		.enum([
			"script-chop",
			"script-dat",
			"textport",
			"parameter-expression",
			"extension",
			"execute-python-script",
		])
		.optional(),
	description: z.string().optional(),
	label: z.string(),
	language: z.enum(["python", "glsl", "tscript"]).default("python"),
});

const operatorPayloadSchema = z.object({
	examples: z.array(operatorExampleSchema).optional(),
	opFamily: z.string(),
	opType: z.string(),
	parameters: z.array(staticOperatorParamSchema),
	versions: operatorVersionSchema,
});

const operatorEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("operator"),
	payload: operatorPayloadSchema,
});

// ── GLSL pattern schemas ───────────────────────────────────────────

const glslUniformSchema = z.object({
	default: z.string().optional(),
	description: z.string().optional(),
	expression: z.string().optional(),
	name: z.string(),
	page: z.string().optional(),
	type: z.enum(["float", "vec2", "vec3", "vec4", "int", "sampler2D"]),
});

const glslOperatorSetupSchema = z.object({
	family: z.string(),
	name: z.string(),
	params: z.record(z.string(), z.unknown()).optional(),
	role: z.enum(["primary", "auxiliary", "input"]).optional(),
	type: z.string(),
});

const glslConnectionSchema = z.object({
	from: z.string(),
	fromOutput: z.number().int().default(0),
	to: z.string(),
	toInput: z.number().int().default(0),
});

const glslSetupSchema = z.object({
	connections: z.array(glslConnectionSchema).optional(),
	operators: z.array(glslOperatorSetupSchema),
	resolution: z.object({ h: z.number(), w: z.number() }).optional(),
	uniforms: z.array(glslUniformSchema).optional(),
});

const glslCodeSchema = z.object({
	glsl: z.string(),
	vertexGlsl: z.string().optional(),
});

const glslPatternPayloadSchema = z.object({
	code: glslCodeSchema,
	difficulty: z.enum(["beginner", "intermediate", "advanced"]),
	estimatedGpuCost: z.enum(["low", "medium", "high"]).optional(),
	minVersion: z.string().optional(),
	setup: glslSetupSchema,
	tags: z.array(z.string()).optional(),
	type: z.enum(["pixel", "vertex", "compute", "utility"]),
});

const glslPatternEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("glsl-pattern"),
	payload: glslPatternPayloadSchema,
});

// ── Lesson schemas ─────────────────────────────────────────────────

const lessonExampleSchema = z.object({
	code: z.string().optional(),
	description: z.string(),
	language: z.enum(["python", "glsl", "tscript"]).optional(),
});

const lessonRecipeSchema = z.object({
	description: z.string(),
	example: lessonExampleSchema.optional(),
	steps: z.array(z.string()).optional(),
});

const lessonOperatorSchema = z.object({
	family: z.string(),
	opType: z.string(),
	role: z.string().optional(),
});

const skillUpdateProposalSchema = z.object({
	proposedAddition: z.string(),
	section: z.string(),
	status: z.enum(["proposed", "approved", "applied", "rejected"]),
	targetFile: z.string(),
});

const lessonProvenanceSchema = provenanceSchema.extend({
	discoveredAt: z.string().optional(),
	discoveredIn: z.string().optional(),
	source: z.enum(["skills-reference", "td-docs", "manual", "auto-scan"]),
	validatedIn: z.array(z.string()).optional(),
	validationCount: z.number().int().min(0).default(0),
});

const lessonPayloadSchema = z.object({
	category: z.enum(["pattern", "pitfall"]),
	cause: z.string().optional(),
	difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
	fix: z.string().optional(),
	operatorChain: z.array(lessonOperatorSchema).optional(),
	recipe: lessonRecipeSchema.optional(),
	relatedPatternIds: z.array(z.string()).optional(),
	skillUpdateProposal: skillUpdateProposalSchema.optional(),
	symptom: z.string().optional(),
	tags: z.array(z.string()),
});

const lessonEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("lesson"),
	payload: lessonPayloadSchema,
	provenance: lessonProvenanceSchema,
});

// ── Enriched operator schemas (post-merge with live data) ───────────

export const enrichedStaticOperatorParamSchema =
	staticOperatorParamSchema.extend({
		clampMax: z.boolean().optional(),
		clampMin: z.boolean().optional(),
		max: z.number().nullable().optional(),
		menuLabels: z.array(z.string()).optional(),
		menuNames: z.array(z.string()).optional(),
		min: z.number().nullable().optional(),
		val: z.unknown().optional(),
	});

export const liveParameterSchema = z.object({
	clampMax: z.boolean().optional(),
	clampMin: z.boolean().optional(),
	default: z.unknown().optional(),
	isOP: z.boolean().optional(),
	label: z.string().optional(),
	max: z.number().nullable().optional(),
	menuLabels: z.array(z.string()).optional(),
	menuNames: z.array(z.string()).optional(),
	min: z.number().nullable().optional(),
	name: z.string().optional(),
	page: z.string().optional(),
	readOnly: z.boolean().optional(),
	style: z.string().optional(),
	val: z.unknown().optional(),
});

export const enrichmentMetaSchema = z.object({
	enrichedAt: z.string().optional(),
	liveFields: z.array(z.string()).optional(),
	source: z.enum(["static", "live", "hybrid"]),
	tdBuild: z.string().nullable().optional(),
});

// ── Workflow pattern schemas ────────────────────────────────────────

const workflowOperatorSchema = z.object({
	family: z.string(),
	opType: z.string(),
	role: z.string().optional(),
});

const workflowConnectionSchema = z.object({
	from: z.string(),
	fromOutput: z.number().int().default(0),
	to: z.string(),
	toInput: z.number().int().default(0),
});

const workflowPatternPayloadSchema = z.object({
	category: z.string(),
	connections: z.array(workflowConnectionSchema),
	difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
	operators: z.array(workflowOperatorSchema),
	tags: z.array(z.string()).optional(),
});

const workflowPatternEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("workflow"),
	payload: workflowPatternPayloadSchema,
});

// ── Network template schemas ───────────────────────────────────────

const templateOperatorSchema = z.object({
	family: z.string(),
	name: z.string(),
	opType: z.string(),
	role: z.string().optional(),
	x: z.number().optional(),
	y: z.number().optional(),
});

const templateConnectionSchema = z.object({
	from: z.string(),
	fromOutput: z.number().int().default(0),
	note: z.string().optional(),
	to: z.string(),
	toInput: z.number().int().default(0),
});

const templatePayloadSchema = z.object({
	category: z.string(),
	connections: z.array(templateConnectionSchema),
	difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
	operators: z.array(templateOperatorSchema),
	parameters: z
		.record(z.string(), z.record(z.string(), z.unknown()))
		.optional(),
	tags: z.array(z.string()).optional(),
});

const templateEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("template"),
	payload: templatePayloadSchema,
});

// ── Technique schemas ─────────────────────────────────────────────

const techniqueCodeSnippetSchema = z.object({
	code: z.string(),
	description: z.string().optional(),
	label: z.string(),
	language: z.enum(["python", "glsl", "tscript"]).default("python"),
});

const techniqueOperatorSchema = z.object({
	family: z.string(),
	opType: z.string(),
	role: z.string().optional(),
});

const techniquePayloadSchema = z.object({
	category: z.enum([
		"gpu-compute",
		"ml",
		"audio-visual",
		"networking",
		"python-advanced",
		"generative",
	]),
	codeSnippets: z.array(techniqueCodeSnippetSchema).optional(),
	difficulty: z.enum(["beginner", "intermediate", "advanced"]),
	operatorChain: z.array(techniqueOperatorSchema).optional(),
	tags: z.array(z.string()),
	tips: z.array(z.string()).optional(),
});

const techniqueEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("technique"),
	payload: techniquePayloadSchema,
});

// ── Tutorial schemas ──────────────────────────────────────────────

const tutorialSectionSchema = z.object({
	code: z.string().optional(),
	content: z.string(),
	title: z.string(),
});

const tutorialPayloadSchema = z.object({
	difficulty: z.enum(["beginner", "intermediate", "advanced"]),
	estimatedTime: z.string(),
	prerequisites: z.array(z.string()),
	relatedOperators: z.array(z.string()),
	sections: z.array(tutorialSectionSchema),
	tags: z.array(z.string()),
});

const tutorialEntrySchema = knowledgeEntryBaseSchema.extend({
	kind: z.literal("tutorial"),
	payload: tutorialPayloadSchema,
});

// ── Discriminated union ─────────────────────────────────────────────

export const knowledgeEntrySchema = z.discriminatedUnion("kind", [
	pythonModuleEntrySchema,
	operatorEntrySchema,
	glslPatternEntrySchema,
	lessonEntrySchema,
	workflowPatternEntrySchema,
	templateEntrySchema,
	techniqueEntrySchema,
	tutorialEntrySchema,
]);

// ── Exported types ──────────────────────────────────────────────────

export type TDKnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type TDPythonModuleEntry = z.infer<typeof pythonModuleEntrySchema>;
export type TDOperatorEntry = z.infer<typeof operatorEntrySchema>;
export type TDGlslPatternEntry = z.infer<typeof glslPatternEntrySchema>;
export type TDLessonEntry = z.infer<typeof lessonEntrySchema>;
export type TDWorkflowPatternEntry = z.infer<typeof workflowPatternEntrySchema>;
export type TDTemplateEntry = z.infer<typeof templateEntrySchema>;
export type TDTechniqueEntry = z.infer<typeof techniqueEntrySchema>;
export type TDTutorialEntry = z.infer<typeof tutorialEntrySchema>;
export type EnrichmentMeta = z.infer<typeof enrichmentMetaSchema>;
export type EnrichedStaticOperatorParam = z.infer<
	typeof enrichedStaticOperatorParamSchema
>;
export type LiveParameter = z.infer<typeof liveParameterSchema>;

export interface EnrichedOperatorEntry
	extends Omit<TDOperatorEntry, "payload"> {
	payload: {
		opType: string;
		opFamily: string;
		parameters: EnrichedStaticOperatorParam[];
		liveParameters?: LiveParameter[];
	};
}
