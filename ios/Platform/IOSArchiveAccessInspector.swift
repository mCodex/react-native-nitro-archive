import Foundation

final class IOSArchiveAccessInspector: ArchiveAccessInspecting {
  func checkFileAccess(path: String, mode: ArchiveAccessMode) -> AccessReport {
    let fileManager = FileManager.default
    let url = URL(fileURLWithPath: path)

    switch mode {
    case .read:
      let readable = fileManager.isReadableFile(atPath: path)
      return AccessReport(accessible: readable, readable: readable, writable: false, reason: readable ? nil : "permission-denied")
    case .write, .createChildren:
      let writable = fileManager.isWritableFile(atPath: path) || fileManager.isWritableFile(atPath: url.deletingLastPathComponent().path)
      return AccessReport(accessible: writable, readable: true, writable: writable, reason: writable ? nil : "permission-denied")
    }
  }

  func checkUriAccess(uri: String, mode: ArchiveAccessMode) -> AccessReport {
    guard let url = URL(string: uri) else {
      return AccessReport(accessible: false, readable: false, writable: false, reason: "invalid-uri")
    }
    return checkFileAccess(path: url.path, mode: mode)
  }
}
