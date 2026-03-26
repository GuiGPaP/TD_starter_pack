import { describe, expect, it } from "vitest";
import {
	generateDeployScript,
	generateForceDeployScript,
} from "../../../src/features/templates/deployScript.js";
import type { ToxAssetManifest } from "../../../src/features/templates/types.js";

const mockManifest: ToxAssetManifest = {
	deploy: { containerName: "null_debug", mode: "import_tox" },
	description: "Test asset",
	id: "null-debug",
	kind: "tox-asset",
	provenance: { license: "MIT", source: "project-original" },
	sha256: "abc123def456".padEnd(64, "0"),
	tags: ["debug"],
	tdVersion: { min: "2023.11000" },
	title: "Null Debug",
	version: "1.0.0",
};

const baseOpts = {
	containerName: "null_debug",
	manifest: mockManifest,
	parentPath: "/project1",
	toxPath: "C:/path/to/asset.tox",
};

describe("generateDeployScript", () => {
	it("generates valid Python script", () => {
		const script = generateDeployScript(baseOpts);
		expect(script).toContain("import json");
		expect(script).toContain("parent_path = '/project1'");
		expect(script).toContain("container_name = 'null_debug'");
		expect(script).toContain("asset_id = 'null-debug'");
		expect(script).toContain("asset_version = '1.0.0'");
	});

	it("contains owner markers", () => {
		const script = generateDeployScript(baseOpts);
		expect(script).toContain("container.tags.add('mcp-asset')");
		expect(script).toContain("container.store('mcp_asset_id', asset_id)");
		expect(script).toContain(
			"container.store('mcp_asset_version', asset_version)",
		);
		expect(script).toContain(
			"container.store('mcp_asset_sha256', asset_sha256)",
		);
	});

	it("handles collision detection", () => {
		const script = generateDeployScript(baseOpts);
		expect(script).toContain("already_exists");
		expect(script).toContain("update_available");
		expect(script).toContain("conflict");
	});

	it("includes rollback on exception", () => {
		const script = generateDeployScript(baseOpts);
		expect(script).toContain("rolled_back");
		expect(script).toContain("rollback_op.destroy()");
	});

	it("uses externaltox + pulse pattern", () => {
		const script = generateDeployScript(baseOpts);
		expect(script).toContain("container.par.externaltox = tox_path");
		expect(script).toContain("container.par.enableexternaltoxpulse.pulse()");
	});

	it("escapes special characters in paths", () => {
		const script = generateDeployScript({
			...baseOpts,
			toxPath: "C:\\Users\\test's\\file.tox",
		});
		expect(script).toContain("C:\\\\Users\\\\test\\'s\\\\file.tox");
	});
});

describe("generateForceDeployScript", () => {
	it("destroys existing before redeploy", () => {
		const script = generateForceDeployScript({
			...baseOpts,
			force: true,
		});
		expect(script).toContain("existing.destroy()");
	});

	it("refuses to force-redeploy over different asset", () => {
		const script = generateForceDeployScript({
			...baseOpts,
			force: true,
		});
		expect(script).toContain("Cannot force redeploy a different asset");
	});

	it("includes rollback on exception", () => {
		const script = generateForceDeployScript({
			...baseOpts,
			force: true,
		});
		expect(script).toContain("rolled_back");
	});
});
