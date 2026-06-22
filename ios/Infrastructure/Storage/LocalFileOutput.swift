import Foundation

final class LocalFileOutput: ArchiveOutput {
  private let path: String
  private var fileHandle: FileHandle?

  init(path: String) {
    self.path = path
  }

  func write(_ data: Data) async throws {
    if fileHandle == nil {
      FileManager.default.createFile(atPath: path, contents: nil)
      fileHandle = try FileHandle(forWritingTo: URL(fileURLWithPath: path))
    }
    try fileHandle?.write(contentsOf: data)
  }

  func finalize() async throws {
    try fileHandle?.close()
    fileHandle = nil
  }
}
