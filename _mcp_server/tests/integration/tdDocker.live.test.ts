import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TouchDesignerClient } from "../../src/tdClient/touchDesignerClient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTAINER_COMPS = ["Tests_web", "Tests_echo", "Tests_osc_test"] as const;
const SERVICE_NAMES = ["web", "echo", "osc-test"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLiveTdConfig(): { host: string; port: string } {
	return {
		host: process.env.TD_WEB_SERVER_HOST || "http://127.0.0.1",
		port: process.env.TD_WEB_SERVER_PORT || "9981",
	};
}

const tdClient = new TouchDesignerClient();

async function execScript<T = unknown>(script: string): Promise<T> {
	const res = await tdClient.execPythonScript<{ result: T }>({
		mode: "full-exec",
		script,
	});
	if (!res.success) {
		throw new Error(`Script failed: ${res.error}`);
	}
	return res.data.result;
}

async function readScript<T = unknown>(script: string): Promise<T> {
	const res = await tdClient.execPythonScript<{ result: T }>({
		mode: "read-only",
		script,
	});
	if (!res.success) {
		throw new Error(`Read script failed: ${res.error}`);
	}
	return res.data.result;
}

async function waitFor(
	checkFn: () => Promise<boolean>,
	{ timeout = 15000, interval = 1000 } = {},
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await checkFn()) return;
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(`waitFor timed out after ${timeout}ms`);
}

let dockerProjectName = "";

async function resolveDockerProjectName(): Promise<string> {
	if (dockerProjectName) return dockerProjectName;
	// TDDocker uses session_id as the docker compose project name
	dockerProjectName = await readScript<string>(
		"op('/TDDocker').ext.TDDockerExt._projects['Tests'].session_id",
	);
	return dockerProjectName;
}

function getDockerState(serviceName: string): string {
	// Query Docker directly from Node.js — avoids TD's async polling
	// and compose_ps Python issues in MCP context
	try {
		const projectName = dockerProjectName;
		const raw = execSync(
			`docker compose -p ${projectName} ps -a --format json`,
			{ encoding: "utf-8", timeout: 10000 },
		);
		for (const line of raw.trim().split("\n")) {
			if (!line.trim()) continue;
			const entry = JSON.parse(line) as { Service: string; State: string };
			if (entry.Service === serviceName) return entry.State;
		}
	} catch {
		// docker not available or project not found
	}
	return "unknown";
}

// ---------------------------------------------------------------------------
// State snapshot for cleanup
// ---------------------------------------------------------------------------

interface TransportSnapshot {
	compName: string;
	osc: boolean;
	ws: boolean;
	ndi: boolean;
}

let initialTransports: TransportSnapshot[] = [];

async function snapshotTransports(): Promise<TransportSnapshot[]> {
	const snapshots: TransportSnapshot[] = [];
	for (const compName of CONTAINER_COMPS) {
		const result = await readScript<{
			osc: boolean;
			ws: boolean;
			ndi: boolean;
		}>(
			`comp = op('/TDDocker/containers/${compName}')
{'osc': comp.par.Oscenable.val == True, 'ws': comp.par.Wsenable.val == True, 'ndi': comp.par.Ndienable.val == True} if comp else {'osc': False, 'ws': False, 'ndi': False}`,
		);
		snapshots.push({ compName, ...result });
	}
	return snapshots;
}

async function restoreTransports(
	snapshots: TransportSnapshot[],
): Promise<void> {
	for (const snap of snapshots) {
		await execScript(
			`comp = op('/TDDocker/containers/${snap.compName}')
if comp:
    comp.par.Oscenable = ${snap.osc ? "True" : "False"}
    comp.par.Wsenable = ${snap.ws ? "True" : "False"}
    comp.par.Ndienable = ${snap.ndi ? "True" : "False"}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("TDDocker E2E", { timeout: 120_000 }, () => {
	beforeAll(async () => {
		const config = getLiveTdConfig();
		process.env.TD_WEB_SERVER_HOST = config.host;
		process.env.TD_WEB_SERVER_PORT = config.port;

		// Preflight: verify TD is reachable
		const info = await tdClient.getTdInfo();
		if (!info.success) {
			throw new Error(
				`TouchDesigner is not reachable at ${config.host}:${config.port}.\n` +
					"Set TD_WEB_SERVER_HOST / TD_WEB_SERVER_PORT or start TD with the web server enabled.",
			);
		}

		// Verify TDDockerExt is loaded with Tests project
		const extLoaded = await readScript<boolean>(
			"ext = op('/TDDocker').ext.TDDockerExt\next is not None and 'Tests' in ext._projects",
		);
		if (!extLoaded) {
			throw new Error(
				"TDDockerExt is not loaded or 'Tests' project not found.\n" +
					"Open TDDocker.toe with the Tests project loaded.",
			);
		}

		// Resolve docker compose project name (session_id used as -p flag)
		await resolveDockerProjectName();

		// Snapshot transport toggles for restore in afterAll
		initialTransports = await snapshotTransports();
	});

	afterAll(async () => {
		// Restore transport toggles
		await restoreTransports(initialTransports);

		// Ensure containers are down via Docker CLI
		try {
			if (dockerProjectName) {
				execSync(`docker compose -p ${dockerProjectName} down`, {
					encoding: "utf-8",
					timeout: 30000,
				});
			}
		} catch {
			// best-effort cleanup
		}
	});

	// -------------------------------------------------------------------
	// Extension & structure
	// -------------------------------------------------------------------

	test("TDDockerExt is accessible and has projects", async () => {
		const projects = await readScript<string[]>(
			"list(op('/TDDocker').ext.TDDockerExt._projects.keys())",
		);
		expect(projects).toContain("Tests");
	});

	test("container COMPs exist under /TDDocker/containers", async () => {
		const comps = await readScript<string[]>(
			"[c.name for c in op('/TDDocker/containers').children if c.isCOMP]",
		);
		for (const name of CONTAINER_COMPS) {
			expect(comps).toContain(name);
		}
	});

	test("each COMP has correct Servicename param", async () => {
		for (let i = 0; i < CONTAINER_COMPS.length; i++) {
			const svcName = await readScript<string>(
				`op('/TDDocker/containers/${CONTAINER_COMPS[i]}').par.Servicename.val`,
			);
			expect(svcName).toBe(SERVICE_NAMES[i]);
		}
	});

	test("status_display textCOMP exists", async () => {
		const exists = await readScript<boolean>(
			"op('/TDDocker/status_display') is not None",
		);
		expect(exists).toBe(true);
	});

	test("projects table DAT exists", async () => {
		const exists = await readScript<boolean>(
			"op('/TDDocker/projects') is not None",
		);
		expect(exists).toBe(true);
	});

	// -------------------------------------------------------------------
	// Docker lifecycle — Up
	// -------------------------------------------------------------------

	test("Up → containers reach running state", async () => {
		await execScript("op('/TDDocker').par.Up.pulse()");

		// Verify via Docker directly (compose_ps is synchronous)
		// TDDocker's PollStatus is async and depends on TD's cook loop for flush
		for (const svcName of SERVICE_NAMES) {
			await waitFor(
				async () => {
					const state = getDockerState(svcName);
					return state === "running";
				},
				{ interval: 2000, timeout: 30000 },
			);
		}
	});

	// -------------------------------------------------------------------
	// Transport operators
	// -------------------------------------------------------------------

	test("enable Oscenable → osc_in, osc_out, oscin_callbacks created", async () => {
		await execScript(
			"op('/TDDocker/containers/Tests_osc_test').par.Oscenable = True",
		);
		await new Promise((r) => setTimeout(r, 1000));

		const children = await readScript<string[]>(
			"[c.name for c in op('/TDDocker/containers/Tests_osc_test').children]",
		);
		expect(children).toContain("osc_in");
		expect(children).toContain("osc_out");
		expect(children).toContain("oscin_callbacks");
	});

	test("disable Oscenable → osc operators removed", async () => {
		await execScript(
			"op('/TDDocker/containers/Tests_osc_test').par.Oscenable = False",
		);
		await new Promise((r) => setTimeout(r, 1000));

		const children = await readScript<string[]>(
			"[c.name for c in op('/TDDocker/containers/Tests_osc_test').children]",
		);
		expect(children).not.toContain("osc_in");
		expect(children).not.toContain("osc_out");
	});

	test("enable Wsenable → websocket_dat, websocket_callbacks created", async () => {
		await execScript(
			"op('/TDDocker/containers/Tests_echo').par.Wsenable = True",
		);
		await new Promise((r) => setTimeout(r, 1000));

		const children = await readScript<string[]>(
			"[c.name for c in op('/TDDocker/containers/Tests_echo').children]",
		);
		expect(children).toContain("websocket_dat");
		expect(children).toContain("websocket_callbacks");
	});

	test("disable Wsenable → websocket operators removed", async () => {
		await execScript(
			"op('/TDDocker/containers/Tests_echo').par.Wsenable = False",
		);
		await new Promise((r) => setTimeout(r, 1000));

		const children = await readScript<string[]>(
			"[c.name for c in op('/TDDocker/containers/Tests_echo').children]",
		);
		expect(children).not.toContain("websocket_dat");
	});

	// -------------------------------------------------------------------
	// Container actions
	// -------------------------------------------------------------------

	test("docker stop on web container → state becomes exited", () => {
		// Use docker CLI directly — TDDocker's par.Stop.pulse() depends on
		// TD's async polling having updated State, which doesn't flush via MCP
		execSync(`docker compose -p ${dockerProjectName} stop web`, {
			encoding: "utf-8",
			timeout: 15000,
		});
		expect(getDockerState("web")).toBe("exited");
	});

	test("docker start on web container → state becomes running", () => {
		execSync(`docker compose -p ${dockerProjectName} start web`, {
			encoding: "utf-8",
			timeout: 15000,
		});
		expect(getDockerState("web")).toBe("running");
	});

	test("Logs on Tests_web → log_dat has content", async () => {
		// Logs pulse fetches via container_manager (async thread)
		await execScript("op('/TDDocker/containers/Tests_web').par.Logs.pulse()");
		await new Promise((r) => setTimeout(r, 3000));

		const logLen = await readScript<number>(
			`comp = op('/TDDocker/containers/Tests_web')
log = comp.op('log_dat')
len(log.text.strip()) if log else 0`,
		);
		expect(logLen).toBeGreaterThan(0);
	});

	// -------------------------------------------------------------------
	// Docker lifecycle — Down
	// -------------------------------------------------------------------

	test("docker compose down → all containers stop", () => {
		execSync(`docker compose -p ${dockerProjectName} down`, {
			encoding: "utf-8",
			timeout: 30000,
		});
		for (const svcName of SERVICE_NAMES) {
			// After down, containers are removed — getDockerState returns "unknown"
			expect(getDockerState(svcName)).toBe("unknown");
		}
	});
});

// ---------------------------------------------------------------------------
// Pulse contract tests — _sync_mode makes actions deterministic
// ---------------------------------------------------------------------------

describe("TDDocker pulse contract", { timeout: 120_000 }, () => {
	let initialTransportsPulse: TransportSnapshot[] = [];

	beforeAll(async () => {
		const config = getLiveTdConfig();
		process.env.TD_WEB_SERVER_HOST = config.host;
		process.env.TD_WEB_SERVER_PORT = config.port;

		// Preflight
		const info = await tdClient.getTdInfo();
		if (!info.success) {
			throw new Error(
				`TouchDesigner not reachable at ${config.host}:${config.port}`,
			);
		}

		// Resolve docker project name
		await resolveDockerProjectName();

		// Snapshot transport toggles
		initialTransportsPulse = await snapshotTransports();

		// Reload compose module to pick up communicate() fix,
		// enable sync mode, then Up + PollStatus inline
		await execScript(
			`import importlib, td_docker.compose
importlib.reload(td_docker.compose)
ext = op('/TDDocker').ext.TDDockerExt
ext._sync_mode = True
ext._up()
ext.PollStatus()`,
		);

		// Verify precondition: web container running with ContainerID
		const state = await readScript<string>(
			"op('/TDDocker/containers/Tests_web').par.State.val",
		);
		if (state !== "running") {
			throw new Error(
				`Precondition failed: Tests_web State=${state}, expected running`,
			);
		}
	});

	afterAll(async () => {
		// Always restore sync mode
		try {
			await execScript("op('/TDDocker').ext.TDDockerExt._sync_mode = False");
		} catch {
			// best-effort
		}

		// Restore transport toggles
		await restoreTransports(initialTransportsPulse);

		// Down containers
		try {
			if (dockerProjectName) {
				execSync(`docker compose -p ${dockerProjectName} down`, {
					encoding: "utf-8",
					timeout: 30000,
				});
			}
		} catch {
			// best-effort
		}
	});

	test("Stop pulse → State becomes exited", async () => {
		await execScript("op('/TDDocker/containers/Tests_web').par.Stop.pulse()");
		const state = await readScript<string>(
			"op('/TDDocker/containers/Tests_web').par.State.val",
		);
		expect(state).toBe("exited");
	});

	test("Start pulse → State becomes running with ContainerID", async () => {
		await execScript("op('/TDDocker/containers/Tests_web').par.Start.pulse()");
		const state = await readScript<string>(
			"op('/TDDocker/containers/Tests_web').par.State.val",
		);
		const cid = await readScript<string>(
			"op('/TDDocker/containers/Tests_web').par.Containerid.val",
		);
		expect(state).toBe("running");
		expect(cid.length).toBeGreaterThan(0);
	});

	test("Restart pulse → State remains running", async () => {
		await execScript(
			"op('/TDDocker/containers/Tests_web').par.Restart.pulse()",
		);
		const state = await readScript<string>(
			"op('/TDDocker/containers/Tests_web').par.State.val",
		);
		expect(state).toBe("running");
	});

	test("Logs pulse → log_dat has content", async () => {
		// Clear log_dat first
		await execScript(
			"log = op('/TDDocker/containers/Tests_web').op('log_dat')\nif log: log.text = ''",
		);
		await execScript("op('/TDDocker/containers/Tests_web').par.Logs.pulse()");
		const logLen = await readScript<number>(
			"log = op('/TDDocker/containers/Tests_web').op('log_dat')\nlen(log.text.strip()) if log else 0",
		);
		expect(logLen).toBeGreaterThan(0);
	});
});
