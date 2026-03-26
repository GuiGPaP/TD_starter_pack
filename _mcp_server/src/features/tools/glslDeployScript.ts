import type { TDGlslPatternEntry } from "../resources/types.js";

/**
 * Escape a string for safe embedding in a Python single-quoted string literal.
 */
function pyStr(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Escape a multi-line GLSL code string for embedding in a Python triple-quoted string.
 */
function pyTriple(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'''/g, "\\'\\'\\'");
}

export interface GlslDeployScriptOptions {
	containerName: string;
	parentPath: string;
	pattern: TDGlslPatternEntry;
}

/**
 * Map pattern operator types to TD operator class names.
 * Conservative: only map types we're confident about.
 */
const OP_TYPE_MAP: Record<string, string> = {
	feedbackTOP: "feedbackTOP",
	glslCopyPOP: "glslCopyPOP",
	glslMAT: "glslMAT",
	glslPOP: "glslPOP",
	glslTOP: "glslmultiTOP",
};

/**
 * Generate a Python script that deploys a GLSL pattern into TouchDesigner.
 *
 * The script:
 * 1. Validates parentPath exists and is not "/"
 * 2. Creates a baseCOMP container with ownership markers
 * 3. Creates operators per setup spec
 * 4. Injects GLSL code into the primary operator (type-specific)
 * 5. Wires connections per spec
 * 6. Documents uniforms in the result (manual config by agent)
 * 7. Rolls back on failure (destroys container)
 */
export function generateGlslDeployScript(
	opts: GlslDeployScriptOptions,
): string {
	const { containerName, parentPath, pattern } = opts;
	const p = pattern.payload;

	// Build operator creation lines
	const opLines = p.setup.operators.map((op) => {
		const tdClass = OP_TYPE_MAP[op.type] ?? op.type;
		return `    nodes['${pyStr(op.name)}'] = container.create(${tdClass}, '${pyStr(op.name)}')`;
	});

	// Build connection lines
	const connLines = (p.setup.connections ?? []).map(
		(c) =>
			`    container.op('${pyStr(c.from)}').outputConnectors[${c.fromOutput}].connect(container.op('${pyStr(c.to)}').inputConnectors[${c.toInput}])`,
	);

	// Build code injection lines (type-specific)
	const codeLines = buildCodeInjectionLines(p, pattern.id);

	// Build uniform documentation for result
	const uniformInfo = (p.setup.uniforms ?? []).map((u) => ({
		default: u.default,
		description: u.description,
		expression: u.expression,
		name: u.name,
		page: u.page,
		type: u.type,
	}));

	return `
import json
from datetime import datetime

parent_path = '${pyStr(parentPath)}'
container_name = '${pyStr(containerName)}'
pattern_id = '${pyStr(pattern.id)}'
pattern_type = '${pyStr(p.type)}'

completed_steps = []
failed_step = None
created_paths = []
shader_dat_paths = []

try:
    parent_op = op(parent_path)
    if parent_op is None:
        result = json.dumps({"status": "error", "patternId": pattern_id, "message": f"Parent path does not exist: {parent_path}"})
        raise SystemExit

    # Check for existing container with ownership
    existing = parent_op.op(container_name)
    if existing is not None:
        stored_id = existing.fetch('mcp_pattern_id', None)
        if stored_id == pattern_id:
            result = json.dumps({
                "status": "already_exists",
                "patternId": pattern_id,
                "path": existing.path,
                "message": f"Pattern '{pattern_id}' already deployed at {existing.path}"
            })
            raise SystemExit
        if stored_id is not None:
            result = json.dumps({
                "status": "conflict",
                "patternId": pattern_id,
                "path": existing.path,
                "message": f"Container '{container_name}' is owned by pattern '{stored_id}'."
            })
            raise SystemExit
        result = json.dumps({
            "status": "conflict",
            "patternId": pattern_id,
            "path": existing.path,
            "message": f"Container '{container_name}' already exists without MCP markers."
        })
        raise SystemExit

    # Step 1: Create container
    container = parent_op.create(baseCOMP, container_name)
    container.tags.add('mcp-glsl-pattern')
    container.store('mcp_pattern_id', pattern_id)
    container.store('mcp_deployed_at', datetime.now().isoformat())
    created_paths.append(container.path)
    completed_steps.append('create_container')

    # Step 2: Create operators
    nodes = {}
    created_nodes = []

${opLines.join("\n")}

    for name, node in nodes.items():
        created_nodes.append({"name": name, "type": node.OPType, "path": node.path})
        created_paths.append(node.path)
    completed_steps.append('create_operators')

    # Step 3: Inject GLSL code
${codeLines.join("\n")}
    completed_steps.append('inject_code')

    # Step 4: Wire connections
${connLines.length > 0 ? connLines.join("\n") : "    pass  # No connections to wire"}
    completed_steps.append('wire_connections')

    result = json.dumps({
        "status": "deployed",
        "patternId": pattern_id,
        "path": container.path,
        "completedSteps": completed_steps,
        "createdNodes": created_nodes,
        "shaderDatPaths": shader_dat_paths,
        "uniforms": ${JSON.stringify(uniformInfo)},
        "message": f"Pattern '{pattern_id}' deployed to {container.path} with {len(created_nodes)} operator(s)"
    })

except SystemExit:
    pass
except Exception as e:
    failed_step_name = 'unknown'
    if 'create_container' not in completed_steps:
        failed_step_name = 'create_container'
    elif 'create_operators' not in completed_steps:
        failed_step_name = 'create_operators'
    elif 'inject_code' not in completed_steps:
        failed_step_name = 'inject_code'
    elif 'wire_connections' not in completed_steps:
        failed_step_name = 'wire_connections'

    rollback_status = 'none'
    cleaned_up_paths = []
    try:
        rollback_op = op(parent_path).op(container_name)
        if rollback_op is not None:
            rollback_op.destroy()
            rollback_status = 'full'
            cleaned_up_paths = created_paths[:]
    except:
        rollback_status = 'partial'

    result = json.dumps({
        "status": "rolled_back",
        "patternId": pattern_id,
        "completedSteps": completed_steps,
        "failedStep": failed_step_name,
        "rollbackStatus": rollback_status,
        "createdPaths": created_paths,
        "cleanedUpPaths": cleaned_up_paths,
        "message": f"Deploy failed at step '{failed_step_name}' and rolled back: {str(e)}"
    })
`.trim();
}

/**
 * Build type-specific GLSL code injection lines.
 */
function buildCodeInjectionLines(
	payload: TDGlslPatternEntry["payload"],
	patternId: string,
): string[] {
	const primaryOp = payload.setup.operators.find((op) => op.role === "primary");
	const primaryName = primaryOp?.name ?? payload.setup.operators[0]?.name;

	if (!primaryName) {
		return [
			`    # WARNING: No primary operator found for pattern '${pyStr(patternId)}'`,
		];
	}

	const glslCode = pyTriple(payload.code.glsl);

	switch (payload.type) {
		case "pixel": {
			// GLSL TOP: find auto-docked DAT and set text on it
			return [
				`    primary = nodes['${pyStr(primaryName)}']`,
				"    # GLSL TOP auto-creates a docked DAT for shader code",
				"    glsl_dat = None",
				"    if hasattr(primary.par, 'dat') and primary.par.dat.eval():",
				"        glsl_dat = primary.par.dat.eval()",
				"    elif primary.docked:",
				"        for d in primary.docked:",
				"            if d.OPType == 'textDAT':",
				"                glsl_dat = d",
				"                break",
				"    if glsl_dat is None:",
				"        glsl_dat = container.create(textDAT, f'{primary.name}_code')",
				"        primary.par.dat = glsl_dat",
				`    glsl_dat.text = '''${glslCode}'''`,
				"    created_nodes.append({'name': glsl_dat.name, 'type': 'textDAT', 'path': glsl_dat.path})",
				"    shader_dat_paths.append(glsl_dat.path)",
			];
		}
		case "vertex": {
			// GLSL MAT: create two Text DATs for vertex and pixel shaders
			const vertexCode = payload.code.vertexGlsl
				? pyTriple(payload.code.vertexGlsl)
				: "";
			return [
				`    primary = nodes['${pyStr(primaryName)}']`,
				"    # GLSL MAT needs separate vertex and pixel shader DATs",
				`    vert_dat = container.create(textDAT, '${pyStr(primaryName)}_vert')`,
				`    frag_dat = container.create(textDAT, '${pyStr(primaryName)}_frag')`,
				`    vert_dat.text = '''${vertexCode}'''`,
				`    frag_dat.text = '''${glslCode}'''`,
				"    created_nodes.append({'name': vert_dat.name, 'type': 'textDAT', 'path': vert_dat.path})",
				"    created_nodes.append({'name': frag_dat.name, 'type': 'textDAT', 'path': frag_dat.path})",
				"    shader_dat_paths.append(vert_dat.path)",
				"    shader_dat_paths.append(frag_dat.path)",
				"    # Point GLSL MAT load parameters to the DATs",
				"    try:",
				"        primary.par.vertexdat = vert_dat",
				"        primary.par.pixeldat = frag_dat",
				"    except:",
				"        pass  # Parameter names may differ across TD versions",
			];
		}
		case "compute": {
			// GLSL POP: code goes in a parameter, not a separate DAT
			return [
				`    primary = nodes['${pyStr(primaryName)}']`,
				"    # GLSL POP: set code directly on the operator",
				"    try:",
				`        primary.par.glsl = '''${glslCode}'''`,
				"    except:",
				"        # Fallback: try common parameter names",
				"        try:",
				`            primary.par.code = '''${glslCode}'''`,
				"        except:",
				"            pass  # Code injection requires manual configuration",
			];
		}
		default:
			return [
				`    # Utility pattern '${pyStr(patternId)}' — no code injection (library only)`,
			];
	}
}
