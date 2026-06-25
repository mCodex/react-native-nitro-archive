import Foundation

struct ArchiveErrorMapper {
  static func mapError(_ error: Error) -> ArchiveDomainError {
    if let archiveDomainError = error as? ArchiveDomainError {
      return archiveDomainError
    }
    return .ioError("Archive error: \(error.localizedDescription)")
  }
}
