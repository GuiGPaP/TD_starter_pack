import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const builtInDir = join(rootDir, "data", "td-assets", "built-in");

const isCheck = process.argv.includes("--check");
const isFix = process.argv.includes("--fix");

if (!isCheck && !isFix) {
	console.error("Usage: syncTdAssets.ts --check | --fix");
	process.exit(1);
}

interface ManifestJson {
	id: string;
	kind: string;
	sha256?: string;
	[key: string]: unknown;
}

const errors: string[] = [];
const fixed: string[] = [];

const dirs = readdirSync(builtInDir, { withFileTypes: true }).filter((e) =>
	e.isDirectory(),
);

for (const dir of dirs) {
	const assetDir = join(builtInDir, dir.name);
	const manifestPath = join(assetDir, "manifest.json");
	const toxPath = join(assetDir, "asset.tox");

	let manifest: ManifestJson;
	try {
		manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
	} catch {
		errors.push(`${dir.name}: cannot read manifest.json`);
		continue;
	}

	if (manifest.kind !== "tox-asset") {
		continue;
	}

	let toxData: Buffer;
	try {
		toxData = readFileSync(toxPath);
	} catch {
		errors.push(`${dir.name}: asset.tox missing for tox-asset`);
		continue;
	}

	const actualHash = createHash("sha256").update(toxData).digest("hex");

	if (manifest.sha256 !== actualHash) {
		if (isCheck) {
			errors.push(
				`${dir.name}: sha256 mismatch — manifest=${manifest.sha256 ?? "(missing)"}, actual=${actualHash}`,
			);
		} else {
			manifest.sha256 = actualHash;
			writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
			fixed.push(`${dir.name}: updated sha256 → ${actualHash}`);
		}
	}
}

if (fixed.length > 0) {
	for (const msg of fixed) {
		console.log(`FIXED: ${msg}`);
	}
}

if (errors.length > 0) {
	for (const msg of errors) {
		console.error(`ERROR: ${msg}`);
	}
	process.exit(1);
} else {
	console.log(
		isCheck
			? "All asset manifests are in sync."
			: `Done. ${fixed.length} manifest(s) updated.`,
	);
}
