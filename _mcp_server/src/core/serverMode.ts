import { EventEmitter } from "node:events";

export type ServerModeValue = "docs-only" | "live";

export class ServerMode extends EventEmitter {
	private _mode: ServerModeValue = "docs-only";
	private _tdBuild: string | null = null;

	get mode(): ServerModeValue {
		return this._mode;
	}

	get isLive(): boolean {
		return this._mode === "live";
	}

	get tdBuild(): string | null {
		return this._tdBuild;
	}

	transitionOnline(tdBuild?: string): void {
		this._tdBuild = tdBuild ?? this._tdBuild;
		if (this._mode !== "live") {
			this._mode = "live";
			this.emit("modeChanged", this._mode);
		}
	}

	transitionOffline(): void {
		this._tdBuild = null;
		if (this._mode !== "docs-only") {
			this._mode = "docs-only";
			this.emit("modeChanged", this._mode);
		}
	}

	toJSON(): { mode: ServerModeValue; tdBuild: string | null } {
		return { mode: this._mode, tdBuild: this._tdBuild };
	}
}
