import Foundation

final class OpenArchiveUseCase {
  private let engine: ArchiveEngine

  init(engine: ArchiveEngine) {
    self.engine = engine
  }

  func execute(input: ArchiveInput) async throws -> (inspection: ArchiveInspection, session: ArchiveEngineSession) {
    let archiveData = try await input.openForRandomAccess()
    let inspection = try engine.inspect(data: archiveData)
    let session = try ArchiveInMemorySession(entries: inspection.entries, archiveData: archiveData)
    return (inspection, session)
  }
}

final class ArchiveInMemorySession: ArchiveEngineSession {
  private let entriesByPath: [String: EntryDescriptor]
  let entries: [EntryDescriptor]
  let archiveData: Data?
  let archiveURL: URL?
  private let tempDir: URL?

  init(entries: [EntryDescriptor], archiveData: Data?) throws {
    self.entries = entries
    self.archiveData = archiveData
    if let archiveData {
      let tempDir = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathComponent("session")
      try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
      let archiveURL = tempDir.appendingPathComponent("archive.zip")
      try archiveData.write(to: archiveURL)
      self.tempDir = tempDir
      self.archiveURL = archiveURL
    } else {
      self.tempDir = nil
      self.archiveURL = nil
    }
    var map: [String: EntryDescriptor] = [:]
    for entry in entries {
      map[entry.path] = entry
    }
    self.entriesByPath = map
  }

  func entry(at path: String) -> EntryDescriptor? {
    entriesByPath[path]
  }

  deinit {
    if let tempDir {
      try? FileManager.default.removeItem(at: tempDir)
    }
  }
}
