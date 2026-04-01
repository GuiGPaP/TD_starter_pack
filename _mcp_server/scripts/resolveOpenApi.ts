/**
 * Resolve all $ref in the OpenAPI spec into a single bundled YAML file.
 * Replaces the Java-based openapi-generator-cli gen:webserver step.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { stringify } from "yaml";

const INPUT = resolve("src/api/index.yml");
const OUTPUT = resolve(
	"td/modules/td_server/openapi_server/openapi/openapi.yaml",
);

async function main() {
	const api = await SwaggerParser.bundle(INPUT);
	mkdirSync(dirname(OUTPUT), { recursive: true });
	writeFileSync(OUTPUT, stringify(api, { lineWidth: 0 }));
	console.log(`Resolved OpenAPI spec → ${OUTPUT}`);
}

main().catch((err) => {
	console.error("Failed to resolve OpenAPI spec:", err);
	process.exit(1);
});
