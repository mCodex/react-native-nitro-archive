import { ArchiveError } from "../errors";
import type { NativeOpenOutcome } from "../specs/ArchiveModule.nitro";
import type { NativeArchiveReader } from "../specs/NativeArchiveReader.nitro";

export {
	mapAccessReport,
	mapCapabilities,
	mapDetection,
} from "./mappers/capabilityMapper";
export { mapEntry, mapEntryInput, mapEntryPage } from "./mappers/entryMapper";
export {
	mapCreationOptions,
	mapExtractionOptions,
	mapOpenOptions,
	mapValidationOptions,
} from "./mappers/optionsMapper";
export { mapProgress } from "./mappers/progressMapper";
export {
	mapCreationResult,
	mapExtractionResult,
	mapIssue,
	mapValidationResult,
	mapWarning,
} from "./mappers/resultMapper";

export function openOutcomeOrThrow(
	native: NativeOpenOutcome,
): NativeArchiveReader {
	if (native.ok && native.reader) {
		return native.reader;
	}
	throw new ArchiveError(
		native.error?.code ?? "E_INTERNAL",
		native.error?.message ?? "Failed to open archive",
		{
			operationId: native.error?.operationId,
			entryPath: native.error?.entryPath,
			source: native.error?.source,
			destination: native.error?.destination,
			nativeCode: native.error?.nativeCode,
		},
	);
}
