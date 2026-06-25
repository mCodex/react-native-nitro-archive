import { getNativeArchiveModule } from "./internal/getNativeModule";
import { mapCapabilities } from "./internal/nativeAdapter";
import type { ArchiveCapabilities } from "./types/archive";

export function getArchiveCapabilities(): ArchiveCapabilities {
	const module = getNativeArchiveModule();
	const native = module.getCapabilities();
	return mapCapabilities(native);
}
