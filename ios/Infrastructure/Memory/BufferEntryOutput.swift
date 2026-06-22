import Foundation

final class BufferEntryOutput: ArchiveOutput {
  private var data = Data()

  func write(_ data: Data) async throws {
    self.data.append(data)
  }

  func finalize() async throws {
  }

  func getData() -> Data {
    return data
  }
}
