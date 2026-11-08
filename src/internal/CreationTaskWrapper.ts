import { ArchiveError } from "../errors";
import type { NativeCreationTask } from "../specs/NativeArchiveTasks.nitro";
import type { CreateArchiveOptions, CreationResult } from "../types/creation";
import type {
	ArchiveProgress,
	ArchiveProgressListener,
	ArchiveTask,
	ArchiveTaskState,
} from "../types/task";
import { mapCreationResult, mapProgress } from "./nativeAdapter";
import { ProgressFanout } from "./progressFanout";

export class CreationTaskWrapper implements ArchiveTask<CreationResult> {
	readonly id: string;
	private fanout = new ProgressFanout();
	private started = false;
	private disposed = false;
	private _progress: ArchiveProgress;
	private nativeDispose: () => void;

	constructor(
		private native: NativeCreationTask,
		private options: CreateArchiveOptions,
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

	async start(): Promise<CreationResult> {
        if (this.disposed) throw new ArchiveError("E_DISPOSED", "Task has been disposed.");

		if (this.started) {
			throw new ArchiveError(
				"E_INVALID_STATE",
				"Task has already been started",
			);
		}
		this.started = true;
		const result = await this.native.start();
		return mapCreationResult(result, this.options.destination);
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
