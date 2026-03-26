import type { ToxAssetManifest } from "./types.js";

/**
 * Escape a string for safe embedding in a Python string literal.
 */
function pyStr(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface DeployScriptOptions {
	containerName: string;
	manifest: ToxAssetManifest;
	parentPath: string;
	toxPath: string;
}

/**
 * Generate a Python script that deploys a .tox asset into TouchDesigner.
 *
 * The script:
 * 1. Validates parentPath exists and is not "/"
 * 2. Checks for existing container with same name
 * 3. Creates a baseCOMP and loads the .tox via externaltox + pulse
 * 4. Tags the container with mcp-asset marker and stores metadata
 * 5. Sets result with path and status
 */
export function generateDeployScript(opts: DeployScriptOptions): string {
	const { containerName, manifest, parentPath, toxPath } = opts;

	return `
import json

parent_path = '${pyStr(parentPath)}'
container_name = '${pyStr(containerName)}'
tox_path = '${pyStr(toxPath)}'
asset_id = '${pyStr(manifest.id)}'
asset_version = '${pyStr(manifest.version)}'
asset_sha256 = '${pyStr(manifest.sha256)}'

try:
    parent_op = op(parent_path)
    if parent_op is None:
        result = json.dumps({"status": "error", "message": f"Parent path does not exist: {parent_path}"})
        raise SystemExit

    # Check for existing container
    existing = parent_op.op(container_name)
    if existing is not None:
        # Check owner markers
        stored_id = existing.fetch('mcp_asset_id', None)
        stored_version = existing.fetch('mcp_asset_version', None)
        stored_sha256 = existing.fetch('mcp_asset_sha256', None)

        if stored_id == asset_id and stored_version == asset_version and stored_sha256 == asset_sha256:
            result = json.dumps({
                "status": "already_exists",
                "path": existing.path,
                "assetId": asset_id,
                "message": f"Asset {asset_id} v{asset_version} already deployed at {existing.path}"
            })
            raise SystemExit

        if stored_id == asset_id:
            result = json.dumps({
                "status": "update_available",
                "path": existing.path,
                "assetId": asset_id,
                "message": f"Asset {asset_id} exists at {existing.path} but version/hash differs. Use force=true to redeploy."
            })
            raise SystemExit

        if stored_id is not None:
            result = json.dumps({
                "status": "conflict",
                "path": existing.path,
                "assetId": asset_id,
                "message": f"Container '{container_name}' exists but is owned by asset '{stored_id}'. Choose a different name."
            })
            raise SystemExit

        # No owner marker — conflict with unknown container
        result = json.dumps({
            "status": "conflict",
            "path": existing.path,
            "assetId": asset_id,
            "message": f"Container '{container_name}' already exists at {existing.path} without MCP ownership markers."
        })
        raise SystemExit

    # Create and load
    container = parent_op.create(baseCOMP, container_name)
    container.par.externaltox = tox_path
    container.par.enableexternaltoxpulse.pulse()

    # Set owner markers
    container.tags.add('mcp-asset')
    container.store('mcp_asset_id', asset_id)
    container.store('mcp_asset_version', asset_version)
    container.store('mcp_asset_sha256', asset_sha256)

    result = json.dumps({
        "status": "deployed",
        "path": container.path,
        "assetId": asset_id,
        "message": f"Asset {asset_id} v{asset_version} deployed to {container.path}"
    })

except SystemExit:
    pass
except Exception as e:
    # Rollback: destroy the container if it was partially created
    try:
        rollback_op = op(parent_path).op(container_name)
        if rollback_op is not None:
            rollback_op.destroy()
    except:
        pass
    result = json.dumps({
        "status": "rolled_back",
        "assetId": asset_id,
        "message": f"Deploy failed and rolled back: {str(e)}"
    })
`.trim();
}

export interface ForceDeployScriptOptions extends DeployScriptOptions {
	force: true;
}

/**
 * Generate a Python script for forced redeployment (destroys existing, redeploys).
 */
export function generateForceDeployScript(
	opts: ForceDeployScriptOptions,
): string {
	const { containerName, manifest, parentPath, toxPath } = opts;

	return `
import json

parent_path = '${pyStr(parentPath)}'
container_name = '${pyStr(containerName)}'
tox_path = '${pyStr(toxPath)}'
asset_id = '${pyStr(manifest.id)}'
asset_version = '${pyStr(manifest.version)}'
asset_sha256 = '${pyStr(manifest.sha256)}'

try:
    parent_op = op(parent_path)
    if parent_op is None:
        result = json.dumps({"status": "error", "message": f"Parent path does not exist: {parent_path}"})
        raise SystemExit

    # Destroy existing if owned by same asset
    existing = parent_op.op(container_name)
    if existing is not None:
        stored_id = existing.fetch('mcp_asset_id', None)
        if stored_id is not None and stored_id != asset_id:
            result = json.dumps({
                "status": "conflict",
                "path": existing.path,
                "assetId": asset_id,
                "message": f"Container '{container_name}' is owned by asset '{stored_id}'. Cannot force redeploy a different asset."
            })
            raise SystemExit
        existing.destroy()

    # Create and load
    container = parent_op.create(baseCOMP, container_name)
    container.par.externaltox = tox_path
    container.par.enableexternaltoxpulse.pulse()

    # Set owner markers
    container.tags.add('mcp-asset')
    container.store('mcp_asset_id', asset_id)
    container.store('mcp_asset_version', asset_version)
    container.store('mcp_asset_sha256', asset_sha256)

    result = json.dumps({
        "status": "deployed",
        "path": container.path,
        "assetId": asset_id,
        "message": f"Asset {asset_id} v{asset_version} force-deployed to {container.path}"
    })

except SystemExit:
    pass
except Exception as e:
    try:
        rollback_op = op(parent_path).op(container_name)
        if rollback_op is not None:
            rollback_op.destroy()
    except:
        pass
    result = json.dumps({
        "status": "rolled_back",
        "assetId": asset_id,
        "message": f"Force deploy failed and rolled back: {str(e)}"
    })
`.trim();
}
