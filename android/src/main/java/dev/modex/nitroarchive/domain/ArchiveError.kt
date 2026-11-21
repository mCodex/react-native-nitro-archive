package com.mcodex.nitroarchive.domain

sealed class ArchiveDomainError(
    val code: String,
    message: String,
    cause: Throwable? = null
) : Exception(message, cause) {

    class InvalidArgument(detail: String) : ArchiveDomainError("E_INVALID_ARGUMENT", "Invalid argument: $detail")
    class InvalidState(detail: String) : ArchiveDomainError("E_INVALID_STATE", "Invalid state: $detail")
    class Disposed : ArchiveDomainError("E_DISPOSED", "Object has been disposed")
    class InvalidArchive(detail: String) : ArchiveDomainError("E_INVALID_ARCHIVE", "Invalid archive: $detail")
    class UnsupportedFormat(detail: String) : ArchiveDomainError("E_UNSUPPORTED_FORMAT", "Unsupported format: $detail")
    class UnsupportedCompression(detail: String) : ArchiveDomainError("E_UNSUPPORTED_COMPRESSION", "Unsupported compression: $detail")
    class UnsupportedEncryption : ArchiveDomainError("E_UNSUPPORTED_ENCRYPTION", "Encryption is not supported")
    class EncryptedArchive : ArchiveDomainError("E_ENCRYPTED_ARCHIVE", "Archive is encrypted")
    class PasswordRequired : ArchiveDomainError("E_PASSWORD_REQUIRED", "Password is required")
    class BadPassword : ArchiveDomainError("E_BAD_PASSWORD", "Incorrect password")
    class EntryNotFound(detail: String) : ArchiveDomainError("E_ENTRY_NOT_FOUND", "Entry not found: $detail")
    class ChecksumMismatch(detail: String) : ArchiveDomainError("E_CHECKSUM_MISMATCH", "Checksum mismatch: $detail")
    class TruncatedArchive : ArchiveDomainError("E_TRUNCATED_ARCHIVE", "Archive is truncated")
    class PathTraversal(detail: String) : ArchiveDomainError("E_PATH_TRAVERSAL", "Path traversal: $detail")
    class AbsolutePath(detail: String) : ArchiveDomainError("E_ABSOLUTE_PATH", "Absolute path rejected: $detail")
    class UnsafeSymlink(detail: String) : ArchiveDomainError("E_UNSAFE_SYMLINK", "Unsafe symlink: $detail")
    class SpecialFile(detail: String) : ArchiveDomainError("E_SPECIAL_FILE", "Special file rejected: $detail")
    class DuplicateEntry(detail: String) : ArchiveDomainError("E_DUPLICATE_ENTRY", "Duplicate entry: $detail")
    class ExtractionLimitExceeded(limit: String, value: String) : ArchiveDomainError("E_EXTRACTION_LIMIT_EXCEEDED", "Extraction limit exceeded: $limit=$value")
    class ArchiveTooLarge : ArchiveDomainError("E_ARCHIVE_TOO_LARGE", "Archive is too large")
    class BufferLimitExceeded : ArchiveDomainError("E_BUFFER_LIMIT_EXCEEDED", "Buffer limit exceeded")
    class InsufficientStorage : ArchiveDomainError("E_INSUFFICIENT_STORAGE", "Insufficient storage")
    class DestinationExists(detail: String) : ArchiveDomainError("E_DESTINATION_EXISTS", "Destination exists: $detail")
    class PermissionDenied(detail: String) : ArchiveDomainError("E_PERMISSION_DENIED", "Permission denied: $detail")
    class PermissionRequired(detail: String) : ArchiveDomainError("E_PERMISSION_REQUIRED", "Permission required: $detail")
    class SecurityScopeRequired : ArchiveDomainError("E_SECURITY_SCOPE_REQUIRED", "Security scope required")
    class BookmarkStale : ArchiveDomainError("E_BOOKMARK_STALE", "Bookmark is stale")
    class ReadOnly : ArchiveDomainError("E_READ_ONLY", "Resource is read-only")
    class UriPermissionRevoked : ArchiveDomainError("E_URI_PERMISSION_REVOKED", "URI permission revoked")
    class UriNotSeekable : ArchiveDomainError("E_URI_NOT_SEEKABLE", "URI is not seekable")
    class ProviderUnsupported : ArchiveDomainError("E_PROVIDER_UNSUPPORTED", "Provider is unsupported")
    class FileNotAvailable(detail: String) : ArchiveDomainError("E_FILE_NOT_AVAILABLE", "File not available: $detail")
    class OperationCancelled : ArchiveDomainError("E_OPERATION_CANCELLED", "Operation cancelled")
    class IoError(detail: String) : ArchiveDomainError("E_IO", "I/O error: $detail")
    class Internal(detail: String) : ArchiveDomainError("E_INTERNAL", "Internal error: $detail")
}
