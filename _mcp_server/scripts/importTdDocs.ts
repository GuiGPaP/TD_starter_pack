/**
 * Deprecated.
 *
 * Importing remote TouchDesigner documentation into the repository would
 * recreate a redistributable corpus derived from Derivative documentation.
 * Keep operator knowledge local to each user's machine instead.
 */

console.error(
	[
		"importTdDocs.ts is disabled.",
		"Do not import or redistribute Derivative operator docs into data/td-knowledge/operators.",
		"Use the MCP tools refresh_operator_catalog or index_td_offline_help to build a local catalog.",
	].join("\n"),
);

process.exitCode = 1;
