import { ArchiveReaderWrapper } from "./internal/ArchiveReaderWrapper";
import { getNativeArchiveModule } from "./internal/getNativeModule";
import { mapOpenOptions, openOutcomeOrThrow } from "./internal/nativeAdapter";
import type { ArchiveReader } from "./public/ArchiveReader";
import type { ArchiveSource } from "./types/archive";

/**
 * Opens a ZIP for metadata, bounded reads, extraction and validation.
 * @param source Construct with fileSource(), uriSource(), or bufferSource().
 * @param options Optional password and indexing budgets. Byte limits must be positive bigint values no greater than Number.MAX_SAFE_INTEGER.
 * @returns An open reader; dispose it after its reads and tasks finish.
 * @throws ArchiveError for reported archive or storage failures.
 * @example
 * const archive = await openArchive(fileSource(zipPath))
 * try {
 *   const page = await archive.listEntries({ limit: 100 })
 *   console.log(page.entries)
 * } finally {
 *   archive.dispose()
 * }
 */
export async function openArchive(
	source: ArchiveSource,
	options?: {
		readonly password?: string;
		readonly maxEntriesToIndex?: number;
		readonly maxCentralDirectoryBytes?: bigint;
	},
): Promise<ArchiveReader> {
	const module = getNativeArchiveModule();
	const opts = mapOpenOptions(
		options,
		source.kind === "uri"
			? { iosSecurityScope: source.iosSecurityScope }
			: undefined,
		source.kind === "buffer" ? { name: source.name } : undefined,
	);

	switch (source.kind) {
		case "file": {
			const outcome = await module.openFile(source.path, opts.path);
			return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome));
		}
		case "uri": {
			const outcome = await module.openUri(source.uri, opts.uri);
			return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome));
		}
		case "buffer": {
			const outcome = await module.openBuffer(source.data, opts.buffer);
			return new ArchiveReaderWrapper(openOutcomeOrThrow(outcome));
		}
		default:
			throw new TypeError(
				`Unknown source kind: ${(source as ArchiveSource).kind}`,
			);
	}
}
