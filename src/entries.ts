import type { ArchiveUriSource } from "./types/archive";
import type {
	BufferArchiveEntryInput,
	DirectoryArchiveEntryInput,
	FileArchiveEntryInput,
	UriArchiveEntryInput,
} from "./types/creation";

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

export function uriEntry(
	source: ArchiveUriSource,
	archivePath: string,
	options: Pick<UriArchiveEntryInput, "compressionMethod"> = {},
): UriArchiveEntryInput {
	return Object.freeze({ kind: "uri", source, archivePath, ...options });
}

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
