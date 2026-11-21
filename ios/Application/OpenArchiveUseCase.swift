import Foundation

final class OpenArchiveUseCase {
  private let engine: ArchiveEngine

  init(engine: ArchiveEngine) {
    self.engine = engine
  }

  func execute(input: ArchiveInput) async throws -> (inspection: ArchiveInspection, session: ArchiveEngineSession) {
    let fileManager = FileManager.default
    let tempDir = fileManager.temporaryDirectory
      .appendingPathComponent("nitro-session-\(UUID().uuidString)", isDirectory: true)
    let archiveURL = tempDir.appendingPathComponent("archive.zip")

    try fileManager.createDirectory(
      at: tempDir, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700]
    )

    do {
      try input.stage(at: archiveURL)
      let inspection = try engine.inspect(at: archiveURL)
      let session = StagedArchiveSession(inspection: inspection, archiveURL: archiveURL)
      return (inspection, session)
    } catch {
      try? fileManager.removeItem(at: tempDir)
      throw error
    }
  }
}

private final class StagedArchiveSession: ArchiveEngineSession {
  private let entriesByPath: [String: EntryDescriptor]
  let inspection: ArchiveInspection
  let archiveURL: URL
  var entries: [EntryDescriptor] { inspection.entries }

  init(inspection: ArchiveInspection, archiveURL: URL) {
    self.inspection = inspection
    self.archiveURL = archiveURL

    var map: [String: EntryDescriptor] = [:]
    for entry in inspection.entries {
      map[entry.path] = entry
    }
    self.entriesByPath = map
  }

  func entry(at path: String) -> EntryDescriptor? {
    entriesByPath[path]
  }

  deinit {
    try? FileManager.default.removeItem(at: archiveURL.deletingLastPathComponent())
  }
}
