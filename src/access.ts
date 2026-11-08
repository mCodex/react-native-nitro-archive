import { getNativeArchiveModule } from "./internal/getNativeModule";
import { mapAccessReport } from "./internal/nativeAdapter";
import type { ArchiveAccessMode, ArchiveAccessReport } from "./types/access";
import type {
	ArchiveFileDestination,
	ArchiveSource,
	ExtractionDestination,
} from "./types/archive";

/**
 * Checks access without showing a picker or permission prompt.
 * @param target Archive input or output location.
 * @param mode Access required by the planned operation.
 * @returns An advisory snapshot with a suggested recovery action.
 * @remarks
 * The operation must recheck access; providers and grants can change after preflight.
 */
export async function checkArchiveAccess(
	target: ArchiveSource | ArchiveFileDestination | ExtractionDestination,
	mode: ArchiveAccessMode,
): Promise<ArchiveAccessReport> {
  if (target === null || typeof target !== "object") {
    throw new TypeError("An archive access target is required.");
  }

  const module = getNativeArchiveModule();
  const platform = module.getCapabilities().platform;

  switch (target.kind) {
    case "file":
    case "directory":
      return mapAccessReport(await module.checkFileAccess(target.path, mode), mode, platform);
    case "uri":
    case "directory-uri":
      return mapAccessReport(await module.checkUriAccess(target.uri, mode), mode, platform);
    case "buffer":
      return {
        platform,
        mode,
        accessible: true,
        readable: true,
        writable: true,
        persistent: true,
        securityScoped: false,
        providerBacked: false,
        requiredManifestPermissions: [],
        recoveryAction: "none",
      };
    default:
      throw new TypeError("Unsupported archive access target.");
  }
}
