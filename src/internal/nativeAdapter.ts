import { ArchiveError } from "../errors";
import type { NativeOpenOutcome } from "../specs/ArchiveModule.nitro";
import type { NativeArchiveReader } from "../specs/NativeArchiveReader.nitro";
import { throwNativeFailure } from "./outcome";

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
	mapValidationResult,
} from "./mappers/resultMapper";

export function openOutcomeOrThrow(
	native: NativeOpenOutcome,
): NativeArchiveReader {
	if (native.ok && native.reader) {
		return native.reader;
	}
	throwNativeFailure(native.error);
	throw new ArchiveError("E_INTERNAL", "Failed to open archive.");
}
