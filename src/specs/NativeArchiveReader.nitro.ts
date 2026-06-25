import type { HybridObject, UInt64 } from "react-native-nitro-modules";
import type {
	NativeExtractionTask,
	NativeValidationTask,
} from "./NativeArchiveTasks.nitro";
import type {
	NativeArchiveEntry,
	NativeEntryPage,
	NativeExtractionRequest,
	NativeValidationRequest,
} from "./NativeArchiveTypes";

export interface NativeArchiveReader
	extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
	readonly format: string;
	readonly entryCount: number;
	readonly compressedSize?: UInt64;
	readonly totalUncompressedSize?: UInt64;
	readonly encrypted: boolean;
	readonly comment?: string;

	listEntries(
		offset: number,
		limit: number,
		prefix?: string,
		kinds?: readonly string[],
	): Promise<NativeEntryPage>;
	getEntry(path: string): Promise<NativeArchiveEntry | undefined>;
	readEntry(
		path: string,
		maxBytes: UInt64,
		password?: string,
		verifyChecksum?: boolean,
	): Promise<ArrayBuffer>;
	startExtraction(request: NativeExtractionRequest): NativeExtractionTask;
	startValidation(request: NativeValidationRequest): NativeValidationTask;
}
