import Darwin
import Foundation

final class SafeDirectoryOutput: DirectoryOutput {
  private struct CreatedPath {
    let url: URL
    let device: dev_t
    let inode: ino_t
    let isDirectory: Bool

    func matches(_ status: stat) -> Bool {
      status.st_dev == device && status.st_ino == inode
    }
  }

  private let baseURL: URL
  private var createdPaths: [CreatedPath] = []
  private var parentDescriptor: Int32?

  init(baseURL: URL) {
    let normalized = baseURL.standardizedFileURL
    self.baseURL = normalized.deletingLastPathComponent().resolvingSymlinksInPath()
      .appendingPathComponent(normalized.lastPathComponent)
  }

  deinit {
    if let parentDescriptor { _ = Darwin.close(parentDescriptor) }
  }

  func prepareDirectory(at path: String) async throws {
    try withDirectory(outputURL(path), create: true) { _ in }
  }

  func installFile(from source: FileHandle, at path: String, checkCancellation: () throws -> Void = {}) async throws {
    let url = try outputURL(path)
    let name = url.lastPathComponent

    try withDirectory(url.deletingLastPathComponent(), create: true) { parent in
      let descriptor = Darwin.openat(parent, name, O_CREAT | O_EXCL | O_WRONLY | O_CLOEXEC | O_NOFOLLOW, 0o600)
      guard descriptor >= 0 else {
        if errno == EEXIST {
          if let status = try fileStatus(parent, name), status.st_mode & S_IFMT == S_IFLNK {
            throw ArchiveDomainError.unsafeSymlink(path)
          }
          throw ArchiveDomainError.destinationExists(path)
        }
        throw ioError()
      }

      let output = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
      let created = try identity(descriptor, url: url, isDirectory: false)

      do {
        try source.seek(toOffset: 0)
        while let chunk = try source.read(upToCount: 128 * 1024), !chunk.isEmpty {
          try checkCancellation()
          try output.write(contentsOf: chunk)
        }
        try output.close()
        createdPaths.append(created)
      } catch {
        try? output.close()
        try? remove(created, parent: parent)
        throw error
      }
    }
  }

  func commit() async throws {
    createdPaths.removeAll()
  }

  func rollback() async throws {
    var firstFailure: Error?
    var remaining: [CreatedPath] = []

    for created in createdPaths.reversed() {
      do {
        try withDirectory(created.url.deletingLastPathComponent(), create: false) { parent in
          try remove(created, parent: parent)
        }
      } catch {
        firstFailure = firstFailure ?? error
        remaining.append(created)
      }
    }

    createdPaths = remaining.reversed()
    if let firstFailure { throw firstFailure }
  }

  private func outputURL(_ path: String) throws -> URL {
    guard !path.contains("\\") else { throw ArchiveDomainError.pathTraversal(path) }
    let components = try ArchivePath(raw: path).components
    return components.reduce(baseURL) { $0.appendingPathComponent($1) }
  }

  private func withDirectory<Value>(
    _ url: URL,
    create: Bool,
    _ action: (Int32) throws -> Value
  ) throws -> Value {
    let anchor = baseURL.deletingLastPathComponent()
    let prefix = anchor.pathComponents
    guard url.pathComponents.starts(with: prefix) else {
      throw ArchiveDomainError.pathTraversal("Extraction output escapes its destination")
    }
    let flags = O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW
    if parentDescriptor == nil {
      if create {
        try FileManager.default.createDirectory(at: anchor, withIntermediateDirectories: true)
      }
      let opened = Darwin.open(anchor.path, flags)
      guard opened >= 0 else { throw ioError() }
      parentDescriptor = opened
    }
    guard let savedParent = parentDescriptor else { throw ioError() }
    var descriptor = fcntl(savedParent, F_DUPFD_CLOEXEC, 0)
    guard descriptor >= 0 else { throw ioError() }
    defer { _ = Darwin.close(descriptor) }

    var location = anchor

    for component in url.pathComponents.dropFirst(prefix.count) {
      location.appendPathComponent(component, isDirectory: true)
      var child = Darwin.openat(descriptor, component, flags)

      if child < 0, errno == ENOENT, create {
        let made = Darwin.mkdirat(descriptor, component, 0o700) == 0
        guard made || errno == EEXIST else { throw ioError() }
        child = Darwin.openat(descriptor, component, flags)

        if made, child >= 0 {
          do {
            createdPaths.append(try identity(child, url: location, isDirectory: true))
          } catch {
            _ = Darwin.close(child)
            throw error
          }
        }
      }

      guard child >= 0 else {
        if let status = try fileStatus(descriptor, component) {
          if status.st_mode & S_IFMT == S_IFLNK {
            throw ArchiveDomainError.unsafeSymlink(component)
          }
          if status.st_mode & S_IFMT != S_IFDIR {
            throw ArchiveDomainError.destinationExists(component)
          }
        }
        throw ioError()
      }

      _ = Darwin.close(descriptor)
      descriptor = child
    }

    return try action(descriptor)
  }

  private func identity(_ descriptor: Int32, url: URL, isDirectory: Bool) throws -> CreatedPath {
    var status = stat()
    guard fstat(descriptor, &status) == 0 else { throw ioError() }
    return CreatedPath(url: url, device: status.st_dev, inode: status.st_ino, isDirectory: isDirectory)
  }

  private func fileStatus(_ descriptor: Int32, _ name: String) throws -> stat? {
    var status = stat()
    if fstatat(descriptor, name, &status, AT_SYMLINK_NOFOLLOW) == 0 { return status }
    if errno == ENOENT { return nil }
    throw ioError()
  }

  private func remove(_ created: CreatedPath, parent: Int32) throws {
    let name = created.url.lastPathComponent
    guard let status = try fileStatus(parent, name) else { return }
    guard created.matches(status) else {
      throw ArchiveDomainError.invalidState("Extraction output changed before cleanup")
    }
    guard Darwin.unlinkat(parent, name, created.isDirectory ? AT_REMOVEDIR : 0) == 0 else {
      throw ioError()
    }
  }

  private func ioError() -> ArchiveDomainError {
    .ioError("Extraction filesystem operation failed")
  }
}
