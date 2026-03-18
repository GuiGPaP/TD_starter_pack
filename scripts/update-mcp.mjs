#!/usr/bin/env node
// scripts/update-mcp.mjs — Rebase custom tools onto an upstream release tag
import { execSync, execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_DIR = resolve(__dirname, "..", "_mcp_server");
const SPEC_SRC = resolve(
  __dirname,
  "..",
  "modules",
  "td_server",
  "openapi_server",
  "openapi",
  "openapi.yaml",
);
const SPEC_DEST = resolve(
  MCP_DIR,
  "td",
  "modules",
  "td_server",
  "openapi_server",
  "openapi",
  "openapi.yaml",
);

function git(...args) {
  const display = ["git", ...args].join(" ");
  console.log(`> ${display}`);
  return execFileSync("git", args, { cwd: MCP_DIR, encoding: "utf-8" }).trim();
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: MCP_DIR, stdio: "inherit" });
}

// --- 1. Ensure upstream remote ---
try {
  git("remote", "get-url", "upstream");
} catch {
  console.log("Adding upstream remote...");
  git(
    "remote",
    "add",
    "upstream",
    "https://github.com/8beeeaaat/touchdesigner-mcp.git",
  );
}

// --- 2. Fetch upstream + origin ---
run("git fetch upstream --tags");
run("git fetch origin td-starter-pack");

// --- 3. Ensure on td-starter-pack branch ---
const branch = git("branch", "--show-current");
if (branch !== "td-starter-pack") {
  console.log(`On '${branch || "detached HEAD"}', switching...`);
  try {
    git("switch", "td-starter-pack");
  } catch {
    git("switch", "-c", "td-starter-pack", "origin/td-starter-pack");
  }
}

// --- 4. Find latest upstream tag (pure JS) ---
const allTags = git("tag", "--sort=-version:refname");
const vTags = allTags.split("\n").filter((t) => /^v\d/.test(t));
if (vTags.length === 0) {
  console.error("No v* tags found upstream.");
  process.exit(1);
}
const latestTag = vTags[0];
const targetTag = process.argv[2] || latestTag;
console.log(`\nTarget tag: ${targetTag}`);

// --- 5. Idempotent guard ---
const targetCommit = git("rev-parse", targetTag);
const mergeBase = git("merge-base", targetTag, "HEAD");
let rebased = false;
if (targetCommit === mergeBase) {
  console.log(`Already based on ${targetTag} — skipping rebase.`);
} else {
  console.log(`Rebasing td-starter-pack onto ${targetTag}...`);
  try {
    git("rebase", targetTag);
    rebased = true;
  } catch {
    console.error("\n⚠️  Conflicts. Resolve manually then:");
    console.error("  cd _mcp_server && git rebase --continue");
    console.error("  node scripts/update-mcp.mjs --post-rebase");
    process.exit(1);
  }
}

// --- 6. Post-rebase: update minApiVersion from spec ---
const specContent = readFileSync(SPEC_SRC, "utf-8");
const versionMatch = specContent.match(/version:\s*['"]?([\d.]+)/);
if (versionMatch) {
  const specVersion = versionMatch[1];
  const pkgPath = resolve(MCP_DIR, "package.json");
  let pkg = readFileSync(pkgPath, "utf-8");
  pkg = pkg.replace(
    /"minApiVersion":\s*"[^"]+"/,
    `"minApiVersion": "${specVersion}"`,
  );
  writeFileSync(pkgPath, pkg);
  console.log(`minApiVersion set to ${specVersion}`);
}

// --- 7. Re-copy spec and regenerate ---
console.log("\nRegenerating from spec...");
copyFileSync(SPEC_SRC, SPEC_DEST);
run("npx orval --config ./orval.config.ts");

// --- 8. Build + test ---
run("npx tsc");
run("npx vitest run ./tests/unit");

// --- 9. Commit locally (don't push) ---
try {
  git("add", "-A");
  git("commit", "-m", `chore: update to ${targetTag}, regenerate spec`);
} catch {
  console.log("Nothing new to commit after regeneration.");
}

// --- 10. Print remaining manual steps ---
console.log(`
✅ MCP server updated to ${targetTag} (local only).

Next steps:
  cd _mcp_server
  git log --oneline -5          # review commits
  git push origin td-starter-pack  # push fork

  cd ..
  git add _mcp_server
  git commit -m "chore: bump mcp submodule to ${targetTag}"
  git push origin main          # push root repo
`);
