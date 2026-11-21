import Foundation

protocol ArchiveInput {
  func stage(at destination: URL) throws
}

protocol ArchiveEngineSession {
  func entry(at path: String) -> EntryDescriptor?
  var entries: [EntryDescriptor] { get }
  var archiveURL: URL { get }
}
