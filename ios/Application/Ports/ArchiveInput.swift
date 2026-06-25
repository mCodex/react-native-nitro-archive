import Foundation

protocol ArchiveInput {
  func openForRandomAccess() async throws -> Data
  var estimatedSize: UInt64? { get }
}

protocol ArchiveEngineSession {
  func entry(at path: String) -> EntryDescriptor?
  var entries: [EntryDescriptor] { get }
  var archiveData: Data? { get }
  var archiveURL: URL? { get }
}
