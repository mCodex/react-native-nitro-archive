import Foundation

protocol ArchiveOutput {
  func write(_ data: Data) async throws
  func finalize() async throws
}
