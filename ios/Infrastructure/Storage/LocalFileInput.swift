import Foundation

final class LocalFileInput: ArchiveInput {
  private let path: String

  var estimatedSize: UInt64? {
    let attrs = try? FileManager.default.attributesOfItem(atPath: path)
    return (attrs?[.size] as? UInt64)
  }

  init(path: String) {
    self.path = path
  }

  func openForRandomAccess() async throws -> Data {
    let url = URL(fileURLWithPath: path)
    return try Data(contentsOf: url)
  }
}
