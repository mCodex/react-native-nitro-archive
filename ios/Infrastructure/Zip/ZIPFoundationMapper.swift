import Foundation
import ZIPFoundation

struct ZIPFoundationMapper {
  static func mapError(_ error: Error) -> ArchiveDomainError {
    if let archiveDomainError = error as? ArchiveDomainError {
      return archiveDomainError
    }
    return .ioError("ZIPFoundation error: \(error.localizedDescription)")
  }
}
