/**
 * Archive formats exposed by this release. ZIP is the only supported format.
 */
export type ArchiveFormat = "zip";

/**
 * Content-based format detection. A filename extension alone does not establish support.
 */
export interface ArchiveFormatDetection {
	/**
	 * Detected ZIP format, or undefined when no supported signature was found.
	 */
	readonly format?: ArchiveFormat;
	/**
	 * Detection confidence from 0 to 1.
	 */
	readonly confidence: number;
	/**
	 * Whether an available filename extension agrees with the detected content.
	 */
	readonly extensionMatches?: boolean;
}

/**
 * Logical entry type recorded in ZIP metadata. Listing an entry does not make it safe to extract.
 */
export type ArchiveEntryKind =
	| "file"
	| "directory"
	| "symlink"
	| "special"
	| "unknown";

/**
 * Compression method found in metadata. Recognition does not imply decode support.
 */
export type EntryCompressionMethod =
	| "store"
	| "deflate"
	| "bzip2"
	| "lzma"
	| "zstd"
	| "unknown";

/**
 * Metadata for one entry in an open archive. Byte counts are bigint; paths are descriptive metadata.
 */
export interface ArchiveEntry {
	/**
	 * Stable zero-based index within this open archive.
	 */
	readonly index: number;
	/**
	 * Normalized forward-slash path stored in the archive; extraction must still validate it.
	 */
	readonly path: string;
	/**
	 * Basename of this archive entry.
	 */
	readonly name: string;
	/**
	 * Normalized parent path inside the archive; empty for a root entry.
	 */
	readonly parentPath: string;
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: ArchiveEntryKind;
	/**
	 * Compressed size in bytes, when available.
	 */
	readonly compressedSize: bigint;
	/**
	 * Uncompressed size in bytes declared by the entry.
	 */
	readonly uncompressedSize: bigint;
	/**
	 * Whether ZIP metadata reports encrypted content.
	 */
	readonly encrypted: boolean;
	/**
	 * Compression method for this entry. Metadata recognition does not establish support.
	 */
	readonly compressionMethod: EntryCompressionMethod;
	/**
	 * Modification timestamp, when supplied or available in metadata.
	 */
	readonly modifiedAt?: Date;
	/**
	 * Unsigned CRC-32 checksum from ZIP metadata, when available.
	 */
	readonly crc32?: number;
	/**
	 * Unix permission bits from archive metadata, when present.
	 */
	readonly unixMode?: number;
}

/**
 * Selects a bounded page of archive metadata.
 * @example
 * const page = await archive.listEntries({ offset: 0, limit: 100, prefix: "photos/" })
 */
export interface ListArchiveEntriesOptions {
	/**
	 * Zero-based entry offset.
	 * @default 0
	 */
	readonly offset?: number;
	/**
	 * Maximum page size, an integer from 1 to 2000. Invalid bounds throw TypeError.
	 * @default 250
	 */
	readonly limit?: number;
	/**
	 * Restricts listing to normalized paths beginning with this prefix.
	 */
	readonly prefix?: string;
	/**
	 * Optional entry-kind filter applied to listing.
	 */
	readonly kinds?: readonly ArchiveEntryKind[];
}

/**
 * A page of metadata. Use nextOffset, when present, to request the next page.
 */
export interface ArchiveEntryPage {
	/**
	 * Entry metadata returned by this page.
	 */
	readonly entries: readonly ArchiveEntry[];
	/**
	 * Zero-based entry offset.
	 * @default 0
	 */
	readonly offset: number;
	/**
	 * Offset to request next; undefined when the listing is complete.
	 */
	readonly nextOffset?: number;
	/**
	 * Total entry count, when known.
	 */
	readonly totalEntries: number;
}

/**
 * An archive at an absolute native path. Prefer fileSource() to construct this value.
 */
export interface ArchiveFileSource {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "file";
	/**
	 * Absolute native filesystem path without a file:// prefix.
	 */
	readonly path: string;
}

/**
 * An archive accessed through a platform URI. Your app must retain the required access grant.
 */
export interface ArchiveUriSource {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "uri";
	/**
	 * Absolute platform URI; URI access requires a grant held by your app.
	 */
	readonly uri: string;
	/**
	 * iOS scope mode: auto attempts access, required fails if acquisition fails, disabled does not acquire it. Ignored on Android.
	 * @default "auto"
	 */
	readonly iosSecurityScope?: "auto" | "required" | "disabled";
}

/**
 * A small archive held in memory. Native code must own a copy before asynchronous retention.
 */
export interface ArchiveBufferSource {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "buffer";
	/**
	 * Binary data as an ArrayBuffer. Intended for bounded in-memory inputs, without base64.
	 */
	readonly data: ArrayBuffer;
	/**
	 * Optional diagnostic filename for this in-memory source.
	 */
	readonly name?: string;
}

/**
 * Input for opening or detecting a ZIP. Construct with fileSource(), uriSource(), or bufferSource().
 */
export type ArchiveSource =
	| ArchiveFileSource
	| ArchiveUriSource
	| ArchiveBufferSource;

/**
 * A new ZIP at an absolute native file path. Construct with fileDestination().
 */
export interface ArchivePathDestination {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "file";
	/**
	 * Absolute native filesystem path without a file:// prefix.
	 */
	readonly path: string;
}

/**
 * A ZIP output document URI. Provider support and write access must be checked at runtime.
 */
export interface ArchiveUriDestination {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "uri";
	/**
	 * Absolute platform URI; URI access requires a grant held by your app.
	 */
	readonly uri: string;
	/**
	 * iOS scope mode: auto attempts access, required fails if acquisition fails, disabled does not acquire it. Ignored on Android.
	 * @default "auto"
	 */
	readonly iosSecurityScope?: "auto" | "required" | "disabled";
}

/**
 * Output location for ZIP creation. Construct with fileDestination() or uriDestination().
 */
export type ArchiveFileDestination =
	| ArchivePathDestination
	| ArchiveUriDestination;

/**
 * A native directory receiving extracted entries. Construct with directoryDestination().
 */
export interface DirectoryPathDestination {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "directory";
	/**
	 * Absolute native filesystem path without a file:// prefix.
	 */
	readonly path: string;
}

/**
 * An extraction directory URI. Android requires a document-tree URI and a valid grant.
 */
export interface DirectoryUriDestination {
	/**
	 * Discriminant identifying the entry, source or destination representation.
	 */
	readonly kind: "directory-uri";
	/**
	 * Absolute platform URI; URI access requires a grant held by your app.
	 */
	readonly uri: string;
	/**
	 * iOS scope mode: auto attempts access, required fails if acquisition fails, disabled does not acquire it. Ignored on Android.
	 * @default "auto"
	 */
	readonly iosSecurityScope?: "auto" | "required" | "disabled";
}

/**
 * Directory receiving extraction output. Provider capabilities can restrict URI destinations.
 */
export type ExtractionDestination =
	| DirectoryPathDestination
	| DirectoryUriDestination;

/**
 * Features advertised by the active native implementation. Check before presenting optional workflows.
 */
export interface ArchiveCapabilities {
	/**
	 * Native platform that produced this report.
	 */
	readonly platform: "ios" | "android";
	/**
	 * Archive formats advertised for reading.
	 */
	readonly readableFormats: readonly ArchiveFormat[];
	/**
	 * Archive formats advertised for creation.
	 */
	readonly writableFormats: readonly ArchiveFormat[];
	/**
	 * Compression methods advertised by this native implementation.
	 */
	readonly compressionMethods: readonly string[];
	/**
	 * Encryption methods advertised by this native implementation; verify the operation you need.
	 */
	readonly encryptionMethods: readonly string[];
	/**
	 * Whether absolute native file paths are accepted.
	 */
	readonly supportsFilePaths: true;
	/**
	 * Whether platform URIs are accepted as input.
	 */
	readonly supportsInputUris: boolean;
	/**
	 * Whether platform document URIs are accepted for ZIP output.
	 */
	readonly supportsOutputUris: boolean;
	/**
	 * Whether directory URIs are accepted for extraction.
	 */
	readonly supportsDirectoryUris: boolean;
	/**
	 * Whether atomic replacement of local output paths is advertised.
	 */
	readonly supportsAtomicPathWrites: boolean;
	/**
	 * Whether iOS security-scoped URL access is advertised.
	 */
	readonly supportsSecurityScopedUrls: boolean;
	/**
	 * Whether ZIP64 support is advertised.
	 */
	readonly supportsZip64: boolean;
}
