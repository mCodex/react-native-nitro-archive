export type ArchiveTaskState =
	| "idle"
	| "running"
	| "cancelling"
	| "succeeded"
	| "failed"
	| "cancelled";

export type ArchiveProgressPhase =
	| "preparing"
	| "scanning"
	| "reading"
	| "compressing"
	| "extracting"
	| "validating"
	| "writing"
	| "finalizing"
	| "cleaning-up";

export interface ArchiveProgress {
	readonly operationId: string;
	readonly phase: ArchiveProgressPhase;
	readonly processedBytes: bigint;
	readonly totalBytes?: bigint;
	readonly processedEntries: number;
	readonly totalEntries?: number;
	readonly currentEntry?: string;
	readonly bytesPerSecond?: number;
	readonly estimatedSecondsRemaining?: number;
	readonly percentage?: number;
}

export type ArchiveProgressListener = (progress: ArchiveProgress) => void;

export interface ArchiveTask<TResult> {
	readonly id: string;
	readonly state: ArchiveTaskState;
	readonly progress: ArchiveProgress;

	start(): Promise<TResult>;
	cancel(): boolean;
	onProgress(listener: ArchiveProgressListener): () => void;
	dispose(): void;
}
