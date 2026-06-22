import Foundation

final class IOSTemporaryStorage {
  private let tempDir: URL

  init() {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("com.mcodex.nitroarchive", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    self.tempDir = dir
  }

  func createTemporaryFile(extension ext: String = ".tmp") -> URL {
    let id = UUID().uuidString
    return tempDir.appendingPathComponent("\(id)\(ext)")
  }

  func cleanAll() {
    try? FileManager.default.removeItem(at: tempDir)
  }
}
