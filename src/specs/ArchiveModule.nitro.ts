import type { HybridObject } from "react-native-nitro-modules";
import type { NativeArchiveReader } from "./NativeArchiveReader.nitro";
import type { NativeCreationTask } from "./NativeArchiveTasks.nitro";
import type {
	NativeAccessOutcome,
	NativeArchiveCapabilities,
	NativeArchiveFailure,
	NativeBufferOpenOptions,
	NativeCreationRequest,
	NativeDetectionOutcome,
	NativePathOpenOptions,
	NativeUriOpenOptions,
} from "./NativeArchiveTypes";

export interface NativeOpenOutcome {
	ok: boolean;
	reader?: NativeArchiveReader;
	error?: NativeArchiveFailure;
}

export interface ArchiveModule
	extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
	getCapabilities(): NativeArchiveCapabilities;

	checkFileAccess(path: string, mode: string): Promise<NativeAccessOutcome>;
	checkUriAccess(uri: string, mode: string): Promise<NativeAccessOutcome>;

	detectFile(path: string): Promise<NativeDetectionOutcome>;
	detectUri(uri: string): Promise<NativeDetectionOutcome>;
	detectBuffer(data: ArrayBuffer): Promise<NativeDetectionOutcome>;

	openFile(
		path: string,
		options: NativePathOpenOptions,
	): Promise<NativeOpenOutcome>;
	openUri(
		uri: string,
		options: NativeUriOpenOptions,
	): Promise<NativeOpenOutcome>;
	openBuffer(
		data: ArrayBuffer,
		options: NativeBufferOpenOptions,
	): Promise<NativeOpenOutcome>;

	create(request: NativeCreationRequest): NativeCreationTask;
}
