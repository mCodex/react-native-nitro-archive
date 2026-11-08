import { getNativeArchiveModule } from "./internal/getNativeModule";
import { mapCapabilities } from "./internal/nativeAdapter";
import type { ArchiveCapabilities } from "./types/archive";

/**
 * Reads capabilities from the active native implementation.
 * @remarks
 * This runtime call initializes the native module lazily. Importing the helper does not create a Hybrid Object.
 * @example
 * const capabilities = getArchiveCapabilities()
 * if (capabilities.supportsInputUris) {
 *   // Offer your app’s document-picker workflow.
 * }
 */
export function getArchiveCapabilities(): ArchiveCapabilities {
	const module = getNativeArchiveModule();
	const native = module.getCapabilities();
	return mapCapabilities(native);
}
