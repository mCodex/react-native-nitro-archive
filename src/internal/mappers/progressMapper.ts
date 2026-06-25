import type { NativeProgress } from "../../specs/NativeArchiveTypes";
import type { ArchiveProgress } from "../../types/task";

export function mapProgress(native: NativeProgress): ArchiveProgress {
	return {
		operationId: native.operationId,
		phase: native.phase as ArchiveProgress["phase"],
		processedBytes: BigInt(native.processedBytes),
		totalBytes:
			native.totalBytes != null ? BigInt(native.totalBytes) : undefined,
		processedEntries: native.processedEntries,
		totalEntries: native.totalEntries ?? undefined,
		currentEntry: native.currentEntry ?? undefined,
		bytesPerSecond: native.bytesPerSecond ?? undefined,
		estimatedSecondsRemaining: native.estimatedSecondsRemaining ?? undefined,
		percentage: native.percentage ?? undefined,
	};
}
