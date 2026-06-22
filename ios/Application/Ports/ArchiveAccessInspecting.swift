import Foundation

enum ArchiveAccessMode {
  case read, write, createChildren
}

struct AccessReport {
  let accessible: Bool
  let readable: Bool
  let writable: Bool
  let reason: String?
}

protocol ArchiveAccessInspecting {
  func checkFileAccess(path: String, mode: ArchiveAccessMode) -> AccessReport
  func checkUriAccess(uri: String, mode: ArchiveAccessMode) -> AccessReport
}
