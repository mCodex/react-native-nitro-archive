import type {
	ArchiveEntry,
	ArchiveEntryPage,
	ArchiveFormat,
	ListArchiveEntriesOptions,
} from "../types/archive";
import type {
	ExtractArchiveOptions,
	ExtractionResult,
} from "../types/extraction";
import type { ArchiveTask } from "../types/task";
import type {
	ValidateArchiveOptions,
	ValidationResult,
} from "../types/validation";

/**
 * An open ZIP session. Dispose after all reads and tasks have completed.
 * @remarks
 * Metadata paths are descriptive; extraction applies its own safety checks.
 * @example
 * const archive = await openArchive(fileSource(zipPath))
 * try {
 *   const page = await archive.listEntries({ limit: 100 })
 *   console.log(page.entries)
 * } finally {
 *   archive.dispose()
 * }
 */
export interface ArchiveReader {
	/**
	 * Format of this open archive.
	 */
	readonly format: ArchiveFormat;
	/**
	 * Number of entries in the archive or created output.
	 */
	readonly entryCount: number;
	/**
	 * Compressed size in bytes, when available.
	 */
	readonly compressedSize?: bigint;
	/**
	 * Total uncompressed bytes declared by the archive, when available.
	 */
	readonly totalUncompressedSize?: bigint;
	/**
	 * Whether ZIP metadata reports encrypted content.
	 */
	readonly encrypted: boolean;
	/**
	 * Optional comment stored in ZIP metadata.
	 */
	readonly comment?: string;

	/**
	 * Reads a bounded page of entry metadata.
	 * @example
	 * const page = await archive.listEntries({ limit: 100 })
	 */
	listEntries(options?: ListArchiveEntriesOptions): Promise<ArchiveEntryPage>;
	/**
	 * Looks up an exact normalized archive path.
	 * @returns Entry metadata, or undefined if no entry matches.
	 */
	getEntry(path: string): Promise<ArchiveEntry | undefined>;
	/**
	 * Reads a bounded entry into memory.
	 * @param path Exact normalized archive path.
	 * @param options maxBytes is a required byte limit; password and checksum verification are operation-scoped.
	 * @returns Binary contents without base64 conversion.
	 * @throws TypeError if maxBytes is missing, nonpositive, or greater than Number.MAX_SAFE_INTEGER.
	 */
	readEntry(
		path: string,
		options: { maxBytes: bigint; password?: string; verifyChecksum?: boolean },
	): Promise<ArrayBuffer>;
	/**
	 * Creates an extraction task without starting it.
	 * @remarks
	 * Call start() once; use restrictive limits for untrusted input.
	 */
	extract(options: ExtractArchiveOptions): ArchiveTask<ExtractionResult>;
	/**
	 * Creates a validation task without starting it. Inspect its result issues after start().
	 */
	validate(options?: ValidateArchiveOptions): ArchiveTask<ValidationResult>;
	/**
	 * Releases held resources. Dispose tasks/readers in finally blocks once their work is finished.
	 */
	dispose(): void;
}
