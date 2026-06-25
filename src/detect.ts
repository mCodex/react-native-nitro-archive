import { getNativeArchiveModule } from "./internal/getNativeModule";
import { mapDetection } from "./internal/nativeAdapter";
import type { ArchiveFormatDetection, ArchiveSource } from "./types/archive";

export async function detectArchiveFormat(
	source: ArchiveSource,
): Promise<ArchiveFormatDetection> {
	const module = getNativeArchiveModule();

	switch (source.kind) {
		case "file":
			return mapDetection(await module.detectFile(source.path));
		case "uri":
			return mapDetection(await module.detectUri(source.uri));
		case "buffer":
			return mapDetection(await module.detectBuffer(source.data));
		default:
			throw new TypeError(
				`Unknown source kind: ${(source as ArchiveSource).kind}`,
			);
	}
}
