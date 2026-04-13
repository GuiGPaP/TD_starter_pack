/**
 * In-memory registry of pre-deploy snapshots.
 * Captures the operator list in a parent before a deploy tool runs,
 * enabling rollback by diffing against the post-deploy state.
 */

import { randomUUID } from "node:crypto";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";

export interface DeploySnapshot {
	id: string;
	timestamp: string;
	parentPath: string;
	toolName: string;
	/** Operator paths that existed BEFORE the deploy */
	operators: string[];
}

const MAX_SNAPSHOTS = 5;

export class DeploySnapshotRegistry {
	private snapshots: DeploySnapshot[] = [];

	/**
	 * Capture a snapshot of operators under parentPath before deploying.
	 * Returns the snapshot ID to include in the deploy response.
	 */
	async capture(
		tdClient: TouchDesignerClient,
		parentPath: string,
		toolName: string,
	): Promise<string> {
		const result = await tdClient.getNodes({
			parentPath,
		});

		const operators: string[] = [];
		if (result.success && result.data?.nodes) {
			for (const node of result.data.nodes) {
				if (node.path) operators.push(node.path);
			}
		}

		const snapshot: DeploySnapshot = {
			id: randomUUID().slice(0, 8),
			operators,
			parentPath,
			timestamp: new Date().toISOString(),
			toolName,
		};

		this.snapshots.push(snapshot);
		if (this.snapshots.length > MAX_SNAPSHOTS) {
			this.snapshots.shift();
		}

		return snapshot.id;
	}

	/** Get the most recent snapshot, or a specific one by ID */
	get(snapshotId?: string): DeploySnapshot | undefined {
		if (snapshotId) {
			return this.snapshots.find((s) => s.id === snapshotId);
		}
		return this.snapshots[this.snapshots.length - 1];
	}

	/** List all snapshots (most recent last) */
	list(): DeploySnapshot[] {
		return [...this.snapshots];
	}

	/** Number of stored snapshots */
	get size(): number {
		return this.snapshots.length;
	}
}
