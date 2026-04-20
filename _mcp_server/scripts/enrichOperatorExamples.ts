/**
 * Deprecated.
 *
 * Operator examples are no longer enriched in a bundled operator corpus.
 * The MCP now builds local operator knowledge from the user's installed
 * TouchDesigner runtime or local Offline Help cache instead.
 */

console.log(
	[
		"enrichOperatorExamples.ts is deprecated.",
		"Bundled operator JSON files are no longer distributed.",
		"Use the MCP tools refresh_operator_catalog or index_td_offline_help to build a local catalog.",
	].join("\n"),
);
