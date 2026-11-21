import Foundation

final class BufferArchiveInput: ArchiveInput {
  private let data: Data

  init(data: Data) {
    self.data = data
  }

  func stage(at destination: URL) throws {
    try data.write(to: destination)
  }
}
