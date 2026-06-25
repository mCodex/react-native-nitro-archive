import { ArchiveError } from "../../errors";
import type {
	NativeBufferOpenOptions,
	NativeCreationRequest,
	NativeExtractionRequest,
	NativePathOpenOptions,
	NativeUriOpenOptions,
	NativeValidationRequest,
} from "../../specs/NativeArchiveTypes";
import type { CreateArchiveOptions } from "../../types/creation";
import type { ExtractArchiveOptions } from "../../types/extraction";
import type { ValidateArchiveOptions } from "../../types/validation";
import { mapEntryInput } from "./entryMapper";

const creatableEncryptionMethods = new Set(["none", "zip-crypto", "aes-256"]);

export function mapExtractionOptions(
	options: ExtractArchiveOptions,
): NativeExtractionRequest {
	const dest = options.destination;
	const native: NativeExtractionRequest = {
		destinationKind: dest.kind,
		entries: options.entries,
		include: options.include,
		exclude: options.exclude,
		overwrite: options.overwrite,
		preserveTimestamps: options.preserveTimestamps,
		cleanupOnError: options.cleanupOnError,
		cleanupOnCancel: options.cleanupOnCancel,
		progressIntervalMs: options.progressIntervalMs,
		password: options.password,
	};

	if (dest.kind === "directory") {
		native.destinationPath = dest.path;
	} else if (dest.kind === "directory-uri") {
		native.destinationUri = dest.uri;
	}

	if (options.limits) {
		native.limits = {
			maxEntries: options.limits.maxEntries,
			maxTotalUncompressedBytes: options.limits.maxTotalUncompressedBytes,
			maxEntryUncompressedBytes: options.limits.maxEntryUncompressedBytes,
			maxCompressionRatio: options.limits.maxCompressionRatio,
			maxPathDepth: options.limits.maxPathDepth,
			maxPathBytes: options.limits.maxPathBytes,
		};
	}

	return native;
}

export function mapCreationOptions(
	options: CreateArchiveOptions,
): NativeCreationRequest {
	const dest = options.destination;
	const encryption = options.encryption;
	if (
		encryption?.method != null &&
		!creatableEncryptionMethods.has(encryption.method)
	) {
		throw new ArchiveError(
			"E_UNSUPPORTED_ENCRYPTION",
			`ZIP creation does not support encryption method: ${encryption.method}`,
		);
	}
	if (
		encryption?.method != null &&
		encryption.method !== "none" &&
		!encryption.password
	) {
		throw new ArchiveError(
			"E_PASSWORD_REQUIRED",
			"ZIP encryption requires a password.",
		);
	}
	const native: NativeCreationRequest = {
		destinationKind: dest.kind,
		entries: options.entries.map(mapEntryInput),
		storeAlreadyCompressed: options.compression?.storeAlreadyCompressed,
		compressionProfile: options.compression?.profile,
		compressionLevel: options.compression?.level,
		existingDestination: options.existingDestination,
		atomic: options.atomic,
		includeEmptyDirectories: options.includeEmptyDirectories,
		preserveTimestamps: options.preserveTimestamps,
		maxInMemoryBytes: options.maxInMemoryBytes,
		progressIntervalMs: options.progressIntervalMs,
		encryptionMethod: encryption?.method,
		encryptionPassword: encryption?.password,
	};

	if (dest.kind === "file") {
		native.destinationPath = dest.path;
	} else if (dest.kind === "uri") {
		native.destinationUri = dest.uri;
	}

	return native;
}

export function mapValidationOptions(
	options: ValidateArchiveOptions,
): NativeValidationRequest {
	return {
		verifyChecksums: options.verifyChecksums,
		scanAllEntries: options.scanAllEntries,
		password: options.password,
		progressIntervalMs: options.progressIntervalMs,
	};
}

export function mapOpenOptions(
	options?: {
		readonly password?: string;
		readonly maxEntriesToIndex?: number;
		readonly maxCentralDirectoryBytes?: bigint;
	},
	uriOptions?: { iosSecurityScope?: "auto" | "required" | "disabled" },
	bufferOptions?: { name?: string },
): {
	path: NativePathOpenOptions;
	uri: NativeUriOpenOptions;
	buffer: NativeBufferOpenOptions;
} {
	const base = {
		password: options?.password,
		maxEntriesToIndex: options?.maxEntriesToIndex,
		maxCentralDirectoryBytes: options?.maxCentralDirectoryBytes,
	};
	return {
		path: base,
		uri: { ...base, iosSecurityScope: uriOptions?.iosSecurityScope },
		buffer: { ...base, name: bufferOptions?.name },
	};
}
