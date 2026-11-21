import Darwin
import Foundation

final class LocalArchiveDestination {
  let file: FileHandle

  private let parent: Int32
  private let staging: Int32
  private let directoryName: String
  private let destinationName: String
  private let replaceExisting: Bool

  init(path: String, replaceExisting: Bool) throws {
    guard path.hasPrefix("/"), !path.utf8.contains(0), path != "/" else {
      throw ArchiveDomainError.invalidArgument("Expected a local archive destination path")
    }

    let output = URL(fileURLWithPath: path).standardizedFileURL
    let directory = output.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

    let flags = O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW
    let parentDescriptor = Darwin.open(directory.resolvingSymlinksInPath().path, flags)
    guard parentDescriptor >= 0 else { throw Self.ioError() }

    let temporaryName = ".nitro-\(UUID().uuidString)"
    guard Darwin.mkdirat(parentDescriptor, temporaryName, 0o700) == 0 else {
      _ = Darwin.close(parentDescriptor)
      throw Self.ioError()
    }
    let stagingDescriptor = Darwin.openat(parentDescriptor, temporaryName, flags)
    guard stagingDescriptor >= 0 else {
      _ = Darwin.unlinkat(parentDescriptor, temporaryName, AT_REMOVEDIR)
      _ = Darwin.close(parentDescriptor)
      throw Self.ioError()
    }
    let fileDescriptor = Darwin.openat(stagingDescriptor, "output", O_CREAT | O_EXCL | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0o600)
    guard fileDescriptor >= 0 else {
      _ = Darwin.close(stagingDescriptor)
      _ = Darwin.unlinkat(parentDescriptor, temporaryName, AT_REMOVEDIR)
      _ = Darwin.close(parentDescriptor)
      throw Self.ioError()
    }

    parent = parentDescriptor
    staging = stagingDescriptor
    directoryName = temporaryName
    destinationName = output.lastPathComponent
    self.replaceExisting = replaceExisting
    file = FileHandle(fileDescriptor: fileDescriptor, closeOnDealloc: true)
  }

  deinit {
    try? file.close()
    _ = Darwin.unlinkat(staging, "output", 0)
    var directoryStatus = stat()
    var openStatus = stat()
    if fstatat(parent, directoryName, &directoryStatus, AT_SYMLINK_NOFOLLOW) == 0,
       fstat(staging, &openStatus) == 0,
       directoryStatus.st_dev == openStatus.st_dev,
       directoryStatus.st_ino == openStatus.st_ino {
      _ = Darwin.unlinkat(parent, directoryName, AT_REMOVEDIR)
    }
    _ = Darwin.close(staging)
    _ = Darwin.close(parent)
  }

  func commit() throws {
    try file.synchronize()
    try file.close()

    let flags: UInt32 = replaceExisting ? 0 : UInt32(RENAME_EXCL)
    guard Darwin.renameatx_np(staging, "output", parent, destinationName, flags) == 0 else {
      if errno == EEXIST { throw ArchiveDomainError.destinationExists(destinationName) }
      throw Self.ioError()
    }
  }

  private static func ioError() -> ArchiveDomainError {
    .ioError("Archive destination operation failed")
  }
}
