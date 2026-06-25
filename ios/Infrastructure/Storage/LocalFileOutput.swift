import Foundation

final class LocalFileOutput: ArchiveOutput {
  private let path: String
  private var fileHandle: FileHandle?

  init(path: String) {
    self.path = path
  }

  func write(_ data: Data) async throws {
    if fileHandle == nil {
      let url = URL(fileURLWithPath: path)
      let parentDir = url.deletingLastPathComponent()
      try FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)
      FileManager.default.createFile(atPath: path, contents: Data())
      fileHandle = try FileHandle(forWritingTo: url)
      try fileHandle?.truncate(atOffset: 0)
    }
    try fileHandle?.write(contentsOf: data)
  }

  func finalize() async throws {
    try fileHandle?.close()
    fileHandle = nil
  }
}
