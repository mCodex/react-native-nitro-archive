import Darwin
import Foundation

final class ArchiveWorkspace {
  let directory: URL

  init(parent: URL = FileManager.default.temporaryDirectory) throws {
    directory = parent.appendingPathComponent("nitro-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700]
    )
  }

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  func createFile(at file: URL) throws -> FileHandle {
    let descriptor = Darwin.open(file.path, O_CREAT | O_EXCL | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0o600)
    guard descriptor >= 0 else {
      throw ArchiveDomainError.ioError("Could not create a private staging file")
    }

    return FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
  }
}
