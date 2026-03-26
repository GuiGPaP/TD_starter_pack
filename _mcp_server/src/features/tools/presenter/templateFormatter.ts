import type { LoadedAsset } from "../../templates/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

/**
 * Format a single asset for the get_td_asset tool response.
 */
export function formatAssetDetail(
	asset: LoadedAsset,
	options?: FormatterOpts & { includeReadme?: boolean },
): string {
	const opts = mergeFormatterOptions(options);
	const m = asset.manifest;

	const lines: string[] = [`# ${m.title}`, "", m.description, ""];

	lines.push(`- **ID:** ${m.id}`);
	lines.push(`- **Kind:** ${m.kind}`);
	lines.push(`- **Source:** ${asset.source}`);

	if (m.kind === "tox-asset") {
		lines.push(`- **Version:** ${m.version}`);
		lines.push(`- **Min TD Version:** ${m.tdVersion.min}`);
		lines.push(`- **Deploy Mode:** ${m.deploy.mode}`);
		lines.push(`- **Container Name:** ${m.deploy.containerName}`);
		lines.push(
			`- **Provenance:** ${m.provenance.source} (${m.provenance.license})`,
		);
		lines.push(`- **SHA-256:** ${m.sha256}`);
	}

	if (m.kind === "external-ref") {
		lines.push("- **Deployable:** false");
	}

	if (m.tags && m.tags.length > 0) {
		lines.push(`- **Tags:** ${m.tags.join(", ")}`);
	}

	if (m.aliases && m.aliases.length > 0) {
		lines.push(`- **Aliases:** ${m.aliases.join(", ")}`);
	}

	if (m.useCases && m.useCases.length > 0) {
		lines.push("", "## Use Cases");
		for (const uc of m.useCases) {
			lines.push(`- ${uc}`);
		}
	}

	if (options?.includeReadme && asset.readme) {
		lines.push("", "## README", "", asset.readme);
	}

	const structured = {
		aliases: m.aliases,
		description: m.description,
		id: m.id,
		kind: m.kind,
		source: asset.source,
		tags: m.tags,
		...(m.kind === "tox-asset"
			? {
					deploy: m.deploy,
					provenance: m.provenance,
					sha256: m.sha256,
					tdVersion: m.tdVersion,
					version: m.version,
				}
			: { deployable: false }),
	};

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: `Asset: ${m.title}` },
		structured,
	});
}

/**
 * Format search results for the search_td_assets tool response.
 */
export function formatAssetSearchResults(
	assets: LoadedAsset[],
	options?: FormatterOpts & { query?: string },
): string {
	const opts = mergeFormatterOptions(options);

	if (assets.length === 0) {
		const msg = options?.query
			? `No assets found matching "${options.query}".`
			: "No assets found.";
		return finalizeFormattedText(msg, opts, {
			context: { title: "Asset Search" },
		});
	}

	const lines: string[] = [
		`# Asset Search Results (${assets.length} found)`,
		"",
	];

	for (const asset of assets) {
		const m = asset.manifest;
		lines.push(`## ${m.title}`);
		lines.push(
			`- **ID:** ${m.id} | **Kind:** ${m.kind} | **Source:** ${asset.source}`,
		);
		if (m.kind === "tox-asset") {
			lines.push(
				`- **Version:** ${m.version} | **Min TD:** ${m.tdVersion.min}`,
			);
		}
		lines.push(`- ${m.description}`);
		if (m.tags && m.tags.length > 0) {
			lines.push(`- **Tags:** ${m.tags.join(", ")}`);
		}
		lines.push("");
	}

	const structured = assets.map((a) => ({
		description: a.manifest.description,
		id: a.manifest.id,
		kind: a.manifest.kind,
		source: a.source,
		tags: a.manifest.tags,
		title: a.manifest.title,
		...(a.manifest.kind === "tox-asset" ? { version: a.manifest.version } : {}),
	}));

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: "Asset Search Results" },
		structured,
	});
}

/**
 * Format deploy result for the deploy_td_asset tool response.
 */
export function formatDeployResult(
	result: {
		assetId: string;
		message?: string;
		path?: string;
		status: string;
	},
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	const lines: string[] = ["# Deploy Result", ""];
	lines.push(`- **Asset:** ${result.assetId}`);
	lines.push(`- **Status:** ${result.status}`);
	if (result.path) {
		lines.push(`- **Path:** ${result.path}`);
	}
	if (result.message) {
		lines.push(`- **Message:** ${result.message}`);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: "Deploy Result" },
		structured: result,
	});
}
