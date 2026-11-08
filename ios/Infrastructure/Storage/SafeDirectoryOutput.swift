import Darwin
import Foundation

final class SafeDirectoryOutput: DirectoryOutput {
  // shortcut: engines reopen paths; descriptor-relative writes are needed to resist concurrent destination replacement.
  private struct CreatedPath {
    let url: URL
    let device: dev_t
    let inode: ino_t
    let isDirectory: Bool
  }

  private let baseURL: URL
  private var createdPaths: [CreatedPath] = []

  init(baseURL: URL) {
    let normalized = baseURL.standardizedFileURL
    self.baseURL = normalized.deletingLastPathComponent().resolvingSymlinksInPath()
      .appendingPathComponent(normalized.lastPathComponent)
  }

  func prepareDirectory(at path: String) async throws {
    let components = try pathComponents(path)
    try prepareParents(components)
  }

  func createFile(at path: String) async throws -> URL {
    let components = try pathComponents(path)
    try prepareParents(Array(components.dropLast()))
    let url = components.reduce(baseURL) { $0.appendingPathComponent($1) }

    if let status = try fileStatus(url) {
      try rejectSymlink(status, at: url)
      throw ArchiveDomainError.destinationExists(path)
    }

    let descriptor = Darwin.open(url.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { throw ioError(url) }
    var status = stat()
    let result = fstat(descriptor, &status)
    let closeResult = Darwin.close(descriptor)
    guard result == 0 else { throw ioError(url) }
    createdPaths.append(CreatedPath(url: url, device: status.st_dev, inode: status.st_ino, isDirectory: false))
    guard closeResult == 0 else { throw ioError(url) }

    return url
  }

  func commit() async throws {
    createdPaths.removeAll()
  }

  func rollback() async throws {
    var firstFailure: Error?
    var remaining: [CreatedPath] = []

    for created in createdPaths.reversed() {
      do {
        try validateParents(of: created.url)
        guard let status = try fileStatus(created.url) else { continue }
        guard status.st_dev == created.device, status.st_ino == created.inode else {
          throw ArchiveDomainError.invalidState("Extraction output changed before cleanup")
        }

        // Never recursively remove a directory: it may contain another operation's files.
        let result = created.isDirectory ? Darwin.rmdir(created.url.path) : Darwin.unlink(created.url.path)
        guard result == 0 else { throw ioError(created.url) }
      } catch {
        firstFailure = firstFailure ?? error
        remaining.append(created)
      }
    }

    createdPaths = remaining.reversed()
    if let firstFailure { throw firstFailure }
  }

  private func pathComponents(_ path: String) throws -> [String] {
    guard !path.contains("\\") else {
      throw ArchiveDomainError.pathTraversal(path)
    }

    return try ArchivePath(raw: path).components
  }

  private func validateParents(of url: URL) throws {
    guard url.path.hasPrefix(baseURL.path + "/") else { return }
    let rootParent = (baseURL.path as NSString).deletingLastPathComponent
    var parent = (url.path as NSString).deletingLastPathComponent

    while parent != rootParent {
      let parentURL = URL(fileURLWithPath: parent)
      guard let status = try fileStatus(parentURL) else { return }
      try rejectSymlink(status, at: parentURL)
      parent = (parent as NSString).deletingLastPathComponent
    }
  }

  private func prepareParents(_ components: [String]) throws {
    try ensureDirectory(baseURL)
    var directory = baseURL

    for component in components {
      directory.appendPathComponent(component)
      try ensureDirectory(directory)
    }
  }

  private func ensureDirectory(_ url: URL) throws {
    if let status = try fileStatus(url) {
      try rejectSymlink(status, at: url)
      guard status.st_mode & S_IFMT == S_IFDIR else {
        throw ArchiveDomainError.destinationExists(url.path)
      }
      return
    }

    let parent = url.deletingLastPathComponent()
    guard parent != url else { throw ArchiveDomainError.ioError("Missing filesystem root") }
    try ensureDirectory(parent)
    guard Darwin.mkdir(url.path, S_IRWXU) == 0 else {
      if errno == EEXIST { return try ensureDirectory(url) }
      throw ioError(url)
    }
    guard let status = try fileStatus(url) else { throw ioError(url) }
    createdPaths.append(CreatedPath(url: url, device: status.st_dev, inode: status.st_ino, isDirectory: true))
  }

  private func fileStatus(_ url: URL) throws -> stat? {
    var status = stat()
    if lstat(url.path, &status) == 0 { return status }
    if errno == ENOENT { return nil }
    throw ioError(url)
  }

  private func rejectSymlink(_ status: stat, at url: URL) throws {
    guard status.st_mode & S_IFMT != S_IFLNK else {
      throw ArchiveDomainError.unsafeSymlink(url.path)
    }
  }

  private func ioError(_ url: URL) -> ArchiveDomainError {
    .ioError("Filesystem operation failed for \(url.lastPathComponent): \(String(cString: strerror(errno)))")
  }
}
