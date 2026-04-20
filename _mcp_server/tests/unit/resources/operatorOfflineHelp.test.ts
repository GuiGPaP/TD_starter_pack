import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	indexOfflineHelpOperators,
	parseOfflineHelpOperator,
} from "../../../src/features/resources/operatorOfflineHelp.js";

describe("operatorOfflineHelp", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `td-offline-help-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { force: true, recursive: true });
	});

	it("parses local OfflineHelp operator HTML into a cacheable entry", () => {
		const filePath = join(tempDir, "Touch_In_TOP.htm");
		writeFileSync(
			filePath,
			[
				"<html><body>",
				"<h1>Touch In TOP</h1>",
				"<p>Reads image data over a TCP/IP network connection.</p>",
				"<div id='Active'><span class='parNameTOP'>Active</span>active - Receives image data while enabled.</div>",
				"</body></html>",
			].join(""),
		);

		const entry = parseOfflineHelpOperator(filePath);

		expect(entry?.id).toBe("touchin-top");
		expect(entry?.payload.opType).toBe("touchinTOP");
		expect(entry?.content.summary).toContain("TCP/IP");
		expect(entry?.payload.parameters[0]).toMatchObject({
			description: "active - Receives image data while enabled.",
			label: "Active",
			name: "active",
		});
		expect(entry?.provenance.source).toBe("local-offline-help");
	});

	it("indexes operator HTML files under a supplied OfflineHelp path", () => {
		writeFileSync(
			join(tempDir, "Noise_TOP.htm"),
			"<h1>Noise TOP</h1><p>Creates procedural noise images.</p>",
		);

		const result = indexOfflineHelpOperators({ offlineHelpPath: tempDir });

		expect(result.sourcePath).toBe(tempDir);
		expect(result.filesScanned).toBe(1);
		expect(result.entries[0].payload.opType).toBe("noiseTOP");
	});
});
