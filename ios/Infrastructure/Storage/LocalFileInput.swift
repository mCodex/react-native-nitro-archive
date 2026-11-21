import Foundation

final class LocalFileInput: ArchiveInput {
  private let path: String

  init(path: String) {
    self.path = path
  }

  func stage(at destination: URL) throws {
    let source = URL(fileURLWithPath: path).resolvingSymlinksInPath()
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
