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
import type { ExtractionLimits, ExtractArchiveOptions } from "../../types/extraction";
import type { ValidateArchiveOptions } from "../../types/validation";
import { assertInteger, toNativeByteCount } from "../assertions";
import { mapEntryInput } from "./entryMapper";

function mapLimits(limits?: ExtractionLimits) {
  if (limits === undefined) return undefined;

  for (const name of ["maxEntries", "maxPathDepth", "maxPathBytes"] as const) {
    const value = limits[name];
    if (value !== undefined) assertInteger(value, name);
  }

  if (limits.maxCompressionRatio !== undefined && (!Number.isFinite(limits.maxCompressionRatio) || limits.maxCompressionRatio <= 0)) {
    throw new TypeError("maxCompressionRatio must be finite and positive.");
  }

  return {
    maxEntries: limits.maxEntries,
    maxTotalUncompressedBytes: toNativeByteCount(limits.maxTotalUncompressedBytes, "maxTotalUncompressedBytes"),
    maxEntryUncompressedBytes: toNativeByteCount(limits.maxEntryUncompressedBytes, "maxEntryUncompressedBytes"),
    maxCompressionRatio: limits.maxCompressionRatio,
    maxPathDepth: limits.maxPathDepth,
    maxPathBytes: limits.maxPathBytes,
  };
}

function assertProgressInterval(value?: number): void {
  if (value !== undefined) assertInteger(value, "progressIntervalMs");
}

const creatableEncryptionMethods = new Set(["none", "zip-crypto", "aes-256"]);

export function mapExtractionOptions(
	options: ExtractArchiveOptions,
): NativeExtractionRequest {
	const dest = options.destination;
  assertProgressInterval(options.progressIntervalMs);
  if (options.entries !== undefined && options.include !== undefined) {
    throw new TypeError("entries and include cannot be combined.");
  }

  const security = options.security;
  if ((security?.preventPathTraversal !== undefined && security.preventPathTraversal !== true) ||
      (security?.rejectAbsolutePaths !== undefined && security.rejectAbsolutePaths !== true) ||
      (security?.rejectSpecialFiles !== undefined && security.rejectSpecialFiles !== true)) {
    throw new TypeError("Path traversal, absolute paths and special files must be rejected.");
  }

  if ((security?.symlinks !== undefined && security.symlinks !== "reject") ||
      (security?.duplicates !== undefined && security.duplicates !== "error") ||
      options.preservePermissions === true || options.preserveExecutableBit === true) {
    throw new TypeError("Link preservation, relaxed duplicate policies and permission preservation are not supported yet.");
  }

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

	native.limits = mapLimits(options.limits);

	return native;
}

export function mapCreationOptions(
	options: CreateArchiveOptions,
): NativeCreationRequest {
	const dest = options.destination;
  assertProgressInterval(options.progressIntervalMs);
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
		maxInMemoryBytes:
			toNativeByteCount(options.maxInMemoryBytes, "maxInMemoryBytes"),
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
  assertProgressInterval(options.progressIntervalMs);
  return {
    limits: mapLimits(options.limits),
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
  if (options?.maxEntriesToIndex !== undefined) assertInteger(options.maxEntriesToIndex, "maxEntriesToIndex");

	const base = {
		password: options?.password,
		maxEntriesToIndex: options?.maxEntriesToIndex,
		maxCentralDirectoryBytes:
			toNativeByteCount(options?.maxCentralDirectoryBytes, "maxCentralDirectoryBytes"),
	};
	return {
		path: base,
		uri: { ...base, iosSecurityScope: uriOptions?.iosSecurityScope },
		buffer: { ...base, name: bufferOptions?.name },
	};
}
