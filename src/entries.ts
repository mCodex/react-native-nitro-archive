import type { ArchiveUriSource } from "./types/archive";
import type {
	BufferArchiveEntryInput,
	DirectoryArchiveEntryInput,
	FileArchiveEntryInput,
	UriArchiveEntryInput,
} from "./types/creation";

/**
 * Adds a local file to ZIP creation inputs without reading it.
 * @param sourcePath Absolute native file path.
 * @param archivePath Relative path to store inside the ZIP.
 * @throws TypeError if sourcePath is not absolute.
 */
export function fileEntry(
	sourcePath: string,
	archivePath: string,
	options: Pick<FileArchiveEntryInput, "compressionMethod"> = {},
): FileArchiveEntryInput {
	if (!sourcePath.startsWith("/")) {
		throw new TypeError("fileEntry(sourcePath) requires an absolute path.");
	}
	return Object.freeze({ kind: "file", sourcePath, archivePath, ...options });
}

/**
 * Adds a platform document to ZIP creation inputs without opening it.
 * @param source URI source with any required access already held by your app.
 * @param archivePath Relative path to store inside the ZIP.
 */
export function uriEntry(
	source: ArchiveUriSource,
	archivePath: string,
	options: Pick<UriArchiveEntryInput, "compressionMethod"> = {},
): UriArchiveEntryInput {
	return Object.freeze({ kind: "uri", source, archivePath, ...options });
}

/**
 * Adds a local directory to ZIP creation inputs without traversing it.
 * @param sourcePath Absolute native directory path.
 * @param archivePath Relative directory prefix inside the ZIP.
 * @param options Defaults: recursive true, includeHidden false, followSymlinks false.
 * @throws TypeError if sourcePath is not absolute.
 */
export function directoryEntry(
	sourcePath: string,
	archivePath: string,
	options: Omit<
		DirectoryArchiveEntryInput,
		"kind" | "sourcePath" | "archivePath"
	> = {},
): DirectoryArchiveEntryInput {
	if (!sourcePath.startsWith("/")) {
		throw new TypeError(
			"directoryEntry(sourcePath) requires an absolute path.",
		);
	}
	return Object.freeze({
		kind: "directory",
		sourcePath,
		archivePath,
		recursive: options.recursive ?? true,
		includeHidden: options.includeHidden ?? false,
		followSymlinks: options.followSymlinks ?? false,
		include: options.include,
		exclude: options.exclude,
	});
}

/**
 * Adds a small binary buffer to ZIP creation inputs without base64.
 * @param data Entry contents; aggregate memory is bounded by maxInMemoryBytes.
 * @param archivePath Relative entry path inside the ZIP.
 * @example
 * const entry = bufferEntry(new TextEncoder().encode("hello").buffer, "hello.txt")
 */
export function bufferEntry(
	data: ArrayBuffer,
	archivePath: string,
	options: Pick<
		BufferArchiveEntryInput,
		"modifiedAt" | "compressionMethod"
	> = {},
): BufferArchiveEntryInput {
	return Object.freeze({ kind: "buffer", data, archivePath, ...options });
}
