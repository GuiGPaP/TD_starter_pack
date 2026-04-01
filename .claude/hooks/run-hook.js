#!/usr/bin/env node
// Universal launcher for .mts hook scripts.
// Compatible with Node 18+. Chooses the best TS execution strategy:
//   1. Node >= 22.6 → --experimental-strip-types (fast, ~0.8s)
//   2. Fallback → npx tsx (slower, ~3.7s)
//   3. Neither available → exit 0 with stderr warning (hook disabled)
//
// Relays stdin to the subprocess and copies its stdout/stderr verbatim
// so that PreToolUse JSON decisions reach Claude Code.

"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const script = process.argv[2];
if (!script) {
  process.stderr.write("run-hook.js: missing script argument\n");
  process.exit(0);
}

// Read all of stdin (hook JSON payload)
let stdin;
try {
  stdin = readFileSync(0); // fd 0 = stdin, returns Buffer
} catch {
  stdin = Buffer.alloc(0);
}

// Check Node version for --experimental-strip-types support (>= 22.6)
const [major, minor] = process.versions.node.split(".").map(Number);
const supportsStripTypes = major > 22 || (major === 22 && minor >= 6);

let result;

if (supportsStripTypes) {
  result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", script],
    { input: stdin, stdio: ["pipe", "pipe", "pipe"], timeout: 25000 }
  );
} else {
  // Fallback to npx tsx
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  result = spawnSync(
    npxCmd,
    ["tsx", script],
    { input: stdin, stdio: ["pipe", "pipe", "pipe"], timeout: 25000 }
  );

  if (result.error && result.error.code === "ENOENT") {
    process.stderr.write(
      "run-hook.js: neither Node 22.6+ nor tsx available — hook disabled\n"
    );
    process.exit(0);
  }
}

// Relay subprocess output verbatim
if (result.stdout && result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}
if (result.stderr && result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

// Exit with same code as subprocess (null/undefined → 0)
process.exit(result.status ?? 0);
