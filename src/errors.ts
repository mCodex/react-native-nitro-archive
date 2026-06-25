import type { ArchiveRecoveryAction } from "./types/access";

export type ArchiveErrorCode =
	| "E_INVALID_ARGUMENT"
	| "E_INVALID_STATE"
	| "E_DISPOSED"
	| "E_INVALID_ARCHIVE"
	| "E_UNSUPPORTED_FORMAT"
	| "E_UNSUPPORTED_COMPRESSION"
	| "E_UNSUPPORTED_ENCRYPTION"
	| "E_ENCRYPTED_ARCHIVE"
	| "E_PASSWORD_REQUIRED"
	| "E_BAD_PASSWORD"
	| "E_ENTRY_NOT_FOUND"
	| "E_CHECKSUM_MISMATCH"
	| "E_TRUNCATED_ARCHIVE"
	| "E_PATH_TRAVERSAL"
	| "E_ABSOLUTE_PATH"
	| "E_UNSAFE_SYMLINK"
	| "E_SPECIAL_FILE"
	| "E_DUPLICATE_ENTRY"
	| "E_EXTRACTION_LIMIT_EXCEEDED"
	| "E_ARCHIVE_TOO_LARGE"
	| "E_BUFFER_LIMIT_EXCEEDED"
	| "E_INSUFFICIENT_STORAGE"
	| "E_DESTINATION_EXISTS"
	| "E_PERMISSION_DENIED"
	| "E_PERMISSION_REQUIRED"
	| "E_SECURITY_SCOPE_REQUIRED"
	| "E_BOOKMARK_STALE"
	| "E_READ_ONLY"
	| "E_URI_PERMISSION_REVOKED"
	| "E_URI_NOT_SEEKABLE"
	| "E_PROVIDER_UNSUPPORTED"
	| "E_FILE_NOT_AVAILABLE"
	| "E_OPERATION_CANCELLED"
	| "E_IO"
	| "E_INTERNAL";

export class ArchiveError extends Error {
	readonly name = "ArchiveError";
	constructor(
		readonly code: ArchiveErrorCode,
		message: string,
		readonly details: {
			readonly operationId?: string;
			readonly entryPath?: string;
			readonly source?: string;
			readonly destination?: string;
			readonly nativeCode?: number;
			readonly recoveryAction?: ArchiveRecoveryAction;
			readonly requiredPermission?: string;
		} = {},
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

export function isArchiveError(error: unknown): error is ArchiveError {
	return error instanceof ArchiveError;
}
