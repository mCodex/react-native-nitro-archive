import Foundation

enum ArchiveDomainError: Error, CustomNSError, Equatable {
  case invalidArgument(String)
  case invalidState(String)
  case disposed
  case invalidArchive(String)
  case unsupportedFormat(String)
  case unsupportedCompression(String)
  case unsupportedEncryption
  case encryptedArchive
  case passwordRequired
  case badPassword
  case entryNotFound(String)
  case checksumMismatch(String)
  case truncatedArchive
  case pathTraversal(String)
  case absolutePath(String)
  case unsafeSymlink(String)
  case specialFile(String)
  case duplicateEntry(String)
  case extractionLimitExceeded(limit: String, value: String)
  case archiveTooLarge
  case bufferLimitExceeded
  case insufficientStorage
  case destinationExists(String)
  case permissionDenied(String)
  case permissionRequired(String)
  case securityScopeRequired
  case bookmarkStale
  case readOnly
  case uriPermissionRevoked
  case uriNotSeekable
  case providerUnsupported
  case fileNotAvailable(String)
  case operationCancelled
  case ioError(String)
  case `internal`(String)

  var code: String {
    switch self {
    case .invalidArgument: return "E_INVALID_ARGUMENT"
    case .invalidState: return "E_INVALID_STATE"
    case .disposed: return "E_DISPOSED"
    case .invalidArchive: return "E_INVALID_ARCHIVE"
    case .unsupportedFormat: return "E_UNSUPPORTED_FORMAT"
    case .unsupportedCompression: return "E_UNSUPPORTED_COMPRESSION"
    case .unsupportedEncryption: return "E_UNSUPPORTED_ENCRYPTION"
    case .encryptedArchive: return "E_ENCRYPTED_ARCHIVE"
    case .passwordRequired: return "E_PASSWORD_REQUIRED"
    case .badPassword: return "E_BAD_PASSWORD"
    case .entryNotFound: return "E_ENTRY_NOT_FOUND"
    case .checksumMismatch: return "E_CHECKSUM_MISMATCH"
    case .truncatedArchive: return "E_TRUNCATED_ARCHIVE"
    case .pathTraversal: return "E_PATH_TRAVERSAL"
    case .absolutePath: return "E_ABSOLUTE_PATH"
    case .unsafeSymlink: return "E_UNSAFE_SYMLINK"
    case .specialFile: return "E_SPECIAL_FILE"
    case .duplicateEntry: return "E_DUPLICATE_ENTRY"
    case .extractionLimitExceeded: return "E_EXTRACTION_LIMIT_EXCEEDED"
    case .archiveTooLarge: return "E_ARCHIVE_TOO_LARGE"
    case .bufferLimitExceeded: return "E_BUFFER_LIMIT_EXCEEDED"
    case .insufficientStorage: return "E_INSUFFICIENT_STORAGE"
    case .destinationExists: return "E_DESTINATION_EXISTS"
    case .permissionDenied: return "E_PERMISSION_DENIED"
    case .permissionRequired: return "E_PERMISSION_REQUIRED"
    case .securityScopeRequired: return "E_SECURITY_SCOPE_REQUIRED"
    case .bookmarkStale: return "E_BOOKMARK_STALE"
    case .readOnly: return "E_READ_ONLY"
    case .uriPermissionRevoked: return "E_URI_PERMISSION_REVOKED"
    case .uriNotSeekable: return "E_URI_NOT_SEEKABLE"
    case .providerUnsupported: return "E_PROVIDER_UNSUPPORTED"
    case .fileNotAvailable: return "E_FILE_NOT_AVAILABLE"
    case .operationCancelled: return "E_OPERATION_CANCELLED"
    case .ioError: return "E_IO"
    case .internal: return "E_INTERNAL"
    }
  }
}
