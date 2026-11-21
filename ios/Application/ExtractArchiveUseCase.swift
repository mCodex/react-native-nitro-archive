import Foundation

struct ExtractionResult {
  let extractedEntries: Int
  let skippedEntries: Int
  let writtenBytes: UInt64
}

final class ExtractArchiveUseCase {
  private let engine: ArchiveEngine

  init(engine: ArchiveEngine) {
    self.engine = engine
  }

  func execute(
    session: ArchiveEngineSession,
    plan: [ExtractionPlanItem],
    destination: DirectoryOutput,
    limits: ExtractionLimits,
    password: String?,
    checkCancellation: @escaping () throws -> Void,
    onProgress: @escaping (String, UInt64, Int) -> Void
  ) async throws -> ExtractionResult {
    let workspace = try ArchiveWorkspace()
    defer { withExtendedLifetime(workspace) {} }

    var extracted = 0
    var writtenBytes: UInt64 = 0
    for item in plan {
      try checkCancellation()

      let path = item.outputPath.normalized
      let entry = item.entry
      switch entry.kind {
      case "directory":
        try await destination.prepareDirectory(at: path)
      case "symlink", "hardlink":
        throw ArchiveDomainError.unsafeSymlink(path)
      case "file":
        let output = workspace.directory.appendingPathComponent(UUID().uuidString)
        let file = try workspace.createFile(at: output)
        defer {
          try? file.close()
          try? FileManager.default.removeItem(at: output)
        }

        let completedBytes = writtenBytes
        let completedEntries = extracted
        let remainingBytes = limits.maxTotalUncompressedBytes - completedBytes
        let limit = min(limits.maxEntryUncompressedBytes, remainingBytes)
        let bytes = try engine.extractEntry(
          session: session, path: entry.path, outputFd: file.fileDescriptor,
          limit: limit, password: password
        ) { bytes, _ in
          guard (try? checkCancellation()) != nil else { return false }
          let progress = min(bytes, limit) + completedBytes
          onProgress(path, progress, completedEntries)
          return true
        }
        guard bytes <= limit, bytes == entry.uncompressedSize else {
          throw ArchiveDomainError.invalidArchive("Extracted size does not match indexed metadata")
        }
        try checkCancellation()
        try await destination.installFile(from: file, at: path, checkCancellation: checkCancellation)
        writtenBytes += bytes
      default:
        throw ArchiveDomainError.specialFile(path)
      }

      extracted += 1
      onProgress(path, writtenBytes, extracted)
    }

    return ExtractionResult(extractedEntries: extracted, skippedEntries: 0, writtenBytes: writtenBytes)
  }
}
