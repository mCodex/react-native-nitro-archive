import Foundation

final class SafeDirectoryOutput: DirectoryOutput {
  private let baseURL: URL
  private var createdPaths: [String] = []

  init(baseURL: URL) {
    self.baseURL = baseURL
  }

  func prepareDirectory(at path: String) async throws {
    let dirURL = baseURL.appendingPathComponent(path)
    guard dirURL.path.hasPrefix(baseURL.path) else {
      throw ArchiveDomainError.pathTraversal(path)
    }
    try FileManager.default.createDirectory(at: dirURL, withIntermediateDirectories: true, attributes: nil)
    createdPaths.append(path)
  }

  func createFile(at path: String) async throws -> URL {
    let fileURL = baseURL.appendingPathComponent(path)
    guard fileURL.path.hasPrefix(baseURL.path) else {
      throw ArchiveDomainError.pathTraversal(path)
    }
    let parent = fileURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true, attributes: nil)
    FileManager.default.createFile(atPath: fileURL.path, contents: nil)
    createdPaths.append(path)
    return fileURL
  }

  func commit() async throws {
    // For local directory output, commit is a no-op
  }

  func rollback() async throws {
    for path in createdPaths.reversed() {
      let url = baseURL.appendingPathComponent(path)
      try? FileManager.default.removeItem(at: url)
    }
    createdPaths.removeAll()
  }
}
