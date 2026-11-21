import { ArchiveError } from "../errors";
import type { NativeArchiveFailure } from "../specs/NativeArchiveTypes";

export function throwNativeFailure(
	failure: NativeArchiveFailure | undefined,
): void {
	if (failure == null) return;

	throw new ArchiveError(failure.code, failure.message, {
		operationId: failure.operationId,
		entryPath: failure.entryPath,
		source: failure.source,
		destination: failure.destination,
		nativeCode: failure.nativeCode,
	});
}
