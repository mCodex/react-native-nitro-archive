import Foundation

final class BufferArchiveInput: ArchiveInput {
  private let data: Data
  var estimatedSize: UInt64? { UInt64(data.count) }

  init(data: Data) {
    self.data = data
  }

  func openForRandomAccess() async throws -> Data {
    return data
  }
}
