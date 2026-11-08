import { ArchiveError } from "../errors";
import type { NativeValidationTask } from "../specs/NativeArchiveTasks.nitro";
import type {
	ArchiveProgress,
	ArchiveProgressListener,
	ArchiveTask,
	ArchiveTaskState,
} from "../types/task";
import type {
	ValidateArchiveOptions,
	ValidationResult,
} from "../types/validation";
import { mapProgress, mapValidationResult } from "./nativeAdapter";
import { ProgressFanout } from "./progressFanout";

export class ValidationTaskWrapper implements ArchiveTask<ValidationResult> {
	readonly id: string;
	private fanout = new ProgressFanout();
	private started = false;
	private disposed = false;
	private _progress: ArchiveProgress;
	private nativeDispose: () => void;

	constructor(
		private native: NativeValidationTask,
		_options?: ValidateArchiveOptions,
	) {
		this.id = native.progress.operationId;
		this._progress = mapProgress(native.progress);

		this.nativeDispose = this.native.onProgress((p) => {
			if (this.disposed) return;
			const mapped = mapProgress(p);
			this._progress = mapped;
			this.fanout.emit(mapped);
		});
	}

	get state(): ArchiveTaskState {
		return this.native.state as ArchiveTaskState;
	}

	get progress(): ArchiveProgress {
		return this._progress;
	}

	async start(): Promise<ValidationResult> {
        if (this.disposed) throw new ArchiveError("E_DISPOSED", "Task has been disposed.");

		if (this.started) {
			throw new ArchiveError(
				"E_INVALID_STATE",
				"Task has already been started",
			);
		}
		this.started = true;
		const result = await this.native.start();
		return mapValidationResult(result);
	}

	cancel(): boolean {
		return !this.disposed && this.native.cancel();
	}

	onProgress(listener: ArchiveProgressListener): () => void {
		return this.fanout.add(listener);
	}

	dispose(): void {
        if (this.disposed) return;

        this.disposed = true;
        this.native.cancel();
        try {
            this.nativeDispose();
        } finally {
            this.fanout.dispose();
        }
	}
}
