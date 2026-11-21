import Foundation

final class LocalFileInput: ArchiveInput {
  private let url: URL
  private let securityScope: String?

  init(path: String) {
    url = URL(fileURLWithPath: path)
    securityScope = nil
  }

  init(uri: URL, securityScope: String?) {
    url = uri
    self.securityScope = securityScope ?? "auto"
  }

  func stage(at destination: URL) throws {
    if let securityScope {
      try withCoordinatedArchiveURL(url, securityScope: securityScope, mode: .read) {
        try copy(from: $0, to: destination)
      }
    } else {
      try copy(from: url, to: destination)
    }
  }

  private func copy(from url: URL, to destination: URL) throws {
    let source = url.resolvingSymlinksInPath()
    let keys: Set<URLResourceKey> = [.isRegularFileKey, .isSymbolicLinkKey]
    let sourceValues = try source.resourceValues(forKeys: keys)
    guard sourceValues.isRegularFile == true else {
      throw ArchiveDomainError.fileNotAvailable("Archive source is not a regular file")
    }

    try FileManager.default.copyItem(at: source, to: destination)

    let stagedValues = try destination.resourceValues(forKeys: keys)
    guard stagedValues.isRegularFile == true, stagedValues.isSymbolicLink != true else {
      throw ArchiveDomainError.fileNotAvailable("Staged archive is not a regular file")
    }
  }
}
