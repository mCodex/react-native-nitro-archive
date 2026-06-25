import type { ArchiveFileDestination, ArchiveUriSource } from "./archive";
import type { ArchiveWarning } from "./extraction";

export type CompressionProfile = "fastest" | "balanced" | "smallest";

export type ZipCompressionMethod = "store" | "deflate";

export type ZipEncryptionMethod = "none" | "zip-crypto" | "aes-128" | "aes-256";

export interface CompressionOptions {
	readonly profile?: CompressionProfile;
	readonly level?: number;
	readonly storeAlreadyCompressed?: boolean;
}

export interface EncryptionOptions {
	/**
	 * ZIP encryption method for newly created archives.
	 *
	 * Creation currently accepts `zip-crypto` and `aes-256` when the active
	 * platform reports them through capabilities. `aes-128` remains in the
	 * shared type for encrypted ZIP read/extract interoperability.
	 */
	readonly method?: ZipEncryptionMethod;
	/**
	 * Password used to encrypt the ZIP entries.
	 *
	 * Passwords are passed only to the current native operation and must not be
	 * logged, cached globally, or emitted in progress/error payloads.
	 */
	readonly password?: string;
}

export interface FileArchiveEntryInput {
	readonly kind: "file";
	readonly sourcePath: string;
	readonly archivePath: string;
	readonly compressionMethod?: ZipCompressionMethod;
}

export interface UriArchiveEntryInput {
	readonly kind: "uri";
	readonly source: ArchiveUriSource;
	readonly archivePath: string;
	readonly compressionMethod?: ZipCompressionMethod;
}

export interface DirectoryArchiveEntryInput {
	readonly kind: "directory";
	readonly sourcePath: string;
	readonly archivePath: string;
	readonly recursive?: boolean;
	readonly includeHidden?: boolean;
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
	readonly followSymlinks?: boolean;
}

export interface BufferArchiveEntryInput {
	readonly kind: "buffer";
	readonly data: ArrayBuffer;
	readonly archivePath: string;
	readonly modifiedAt?: Date;
	readonly compressionMethod?: ZipCompressionMethod;
}

export type ArchiveEntryInput =
	| FileArchiveEntryInput
	| UriArchiveEntryInput
	| DirectoryArchiveEntryInput
	| BufferArchiveEntryInput;

export interface CreateArchiveOptions {
	readonly destination: ArchiveFileDestination;
	readonly entries: readonly ArchiveEntryInput[];
	readonly compression?: CompressionOptions;
	readonly encryption?: EncryptionOptions;
	readonly existingDestination?: "error" | "replace";
	readonly atomic?: boolean;
	readonly includeEmptyDirectories?: boolean;
	readonly preserveTimestamps?: boolean;
	readonly maxInMemoryBytes?: bigint;
	readonly progressIntervalMs?: number;
}

export interface CreationResult {
	readonly operationId: string;
	readonly output: ArchiveFileDestination;
	readonly entryCount: number;
	readonly inputBytes: bigint;
	readonly outputBytes: bigint;
	readonly durationMs: number;
	readonly atomicWriteApplied: boolean;
	readonly warnings: readonly ArchiveWarning[];
}
