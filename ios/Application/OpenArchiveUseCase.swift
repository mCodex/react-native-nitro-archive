import Foundation

final class OpenArchiveUseCase {
  private let engine: ArchiveEngine

  init(engine: ArchiveEngine) {
    self.engine = engine
  }

  func execute(input: ArchiveInput) async throws -> (inspection: ArchiveInspection, session: ArchiveEngineSession) {
    let archiveData = try await input.openForRandomAccess()
    let inspection = try await engine.inspect(input: input)
    let session = ArchiveInMemorySession(entries: inspection.entries, archiveData: archiveData)
    return (inspection, session)
  }
}

final class ArchiveInMemorySession: ArchiveEngineSession {
  private let entriesByPath: [String: EntryDescriptor]
  let entries: [EntryDescriptor]
  let archiveData: Data?

  init(entries: [EntryDescriptor], archiveData: Data?) {
    self.entries = entries
    self.archiveData = archiveData
    var map: [String: EntryDescriptor] = [:]
    for entry in entries {
      map[entry.path] = entry
    }
    self.entriesByPath = map
  }

  func entry(at path: String) -> EntryDescriptor? {
    entriesByPath[path]
  }
}
