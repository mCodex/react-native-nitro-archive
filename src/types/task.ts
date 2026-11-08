/**
 * Single-use task lifecycle. succeeded, failed and cancelled are terminal states.
 */
export type ArchiveTaskState =
	| "idle"
	| "running"
	| "cancelling"
	| "succeeded"
	| "failed"
	| "cancelled";

/**
 * Phase reported by the owning task; work can pass through several phases.
 */
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

/**
 * Progress snapshot for one operation. Unknown totals and estimates are omitted.
 */
export interface ArchiveProgress {
	/**
	 * Identifier of the native operation that produced this snapshot or result.
	 */
	readonly operationId: string;
	/**
	 * Current operation phase.
	 */
	readonly phase: ArchiveProgressPhase;
	/**
	 * Bytes processed so far in the reported phase.
	 */
	readonly processedBytes: bigint;
	/**
	 * Total byte work, when known; omitted while the total is unavailable.
	 */
	readonly totalBytes?: bigint;
	/**
	 * Number of entries processed so far.
	 */
	readonly processedEntries: number;
	/**
	 * Total entry count, when known.
	 */
	readonly totalEntries?: number;
	/**
	 * Archive path being processed, when available.
	 */
	readonly currentEntry?: string;
	/**
	 * Estimated throughput in bytes per second, when available.
	 */
	readonly bytesPerSecond?: number;
	/**
	 * Estimated remaining duration in seconds, when available.
	 */
	readonly estimatedSecondsRemaining?: number;
	/**
	 * Completion from 0 to 100, or undefined when total work is unknown.
	 */
	readonly percentage?: number;
}

/**
 * Receives task-scoped snapshots. Unsubscribe when the consumer no longer needs updates.
 */
export type ArchiveProgressListener = (progress: ArchiveProgress) => void;

/**
 * Single-use asynchronous operation with task-scoped progress and cooperative cancellation.
 * @remarks
 * Operations are process-bound; they are not durable background jobs.
 */
export interface ArchiveTask<TResult> {
	/**
	 * Identifier of this task.
	 */
	readonly id: string;
	/**
	 * Current lifecycle state of this task.
	 */
	readonly state: ArchiveTaskState;
	/**
	 * Most recent task-scoped progress snapshot.
	 */
	readonly progress: ArchiveProgress;

	/**
	 * Starts this single-use task.
	 * @returns The completed operation result.
	 * @throws ArchiveError with E_INVALID_STATE when start() is called again.
	 */
	start(): Promise<TResult>;
	/**
	 * Requests cooperative cancellation.
	 * @returns Whether the task accepted the cancellation request; completion can race with cancellation.
	 */
	cancel(): boolean;
	/**
	 * Subscribes to this task only.
	 * @returns A function that removes this listener.
	 */
	onProgress(listener: ArchiveProgressListener): () => void;
	/**
	 * Releases held resources. Dispose tasks/readers in finally blocks once their work is finished.
	 */
	dispose(): void;
}
