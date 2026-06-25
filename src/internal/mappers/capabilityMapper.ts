import { ArchiveError } from "../../errors";
import type {
	NativeAccessOutcome,
	NativeArchiveCapabilities,
	NativeDetectionOutcome,
} from "../../specs/NativeArchiveTypes";
import type {
	ArchiveAccessMode,
	ArchiveAccessReport,
} from "../../types/access";
import type {
	ArchiveCapabilities,
	ArchiveFormat,
	ArchiveFormatDetection,
} from "../../types/archive";

export function mapCapabilities(
	native: NativeArchiveCapabilities,
): ArchiveCapabilities {
	return {
		platform: native.platform as "ios" | "android",
		readableFormats: native.readableFormats as readonly ArchiveFormat[],
		writableFormats: native.writableFormats as readonly ArchiveFormat[],
		compressionMethods: native.compressionMethods,
		encryptionMethods: native.encryptionMethods,
		supportsFilePaths: true as const,
		supportsInputUris: native.supportsInputUris,
		supportsOutputUris: native.supportsOutputUris,
		supportsDirectoryUris: native.supportsDirectoryUris,
		supportsAtomicPathWrites: native.supportsAtomicPathWrites,
		supportsSecurityScopedUrls: native.supportsSecurityScopedUrls,
		supportsZip64: native.supportsZip64,
	};
}

export function mapDetection(
	native: NativeDetectionOutcome,
): ArchiveFormatDetection {
	if (!native.ok) {
		throw new ArchiveError(
			native.error?.code ?? "E_INTERNAL",
			native.error?.message ?? "Archive detection failed",
		);
	}
	return {
		format: native.format as ArchiveFormat | undefined,
		confidence: native.confidence,
		extensionMatches: native.extensionMatches ?? undefined,
	};
}

export function mapAccessReport(
	native: NativeAccessOutcome,
	mode: ArchiveAccessMode,
): ArchiveAccessReport {
	return {
		platform: native.ok ? ("ios" as const) : ("android" as const),
		mode,
		accessible: native.accessible,
		readable: native.readable,
		writable: native.writable,
		persistent: native.persistent,
		securityScoped: native.securityScoped,
		providerBacked: native.providerBacked,
		seekable: native.seekable ?? undefined,
		requiredManifestPermissions: [],
		recoveryAction: (native.recoveryAction ??
			"none") as ArchiveAccessReport["recoveryAction"],
		reason: native.reason ?? undefined,
	};
}
