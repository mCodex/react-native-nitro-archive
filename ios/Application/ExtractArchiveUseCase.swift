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
    onProgress: @escaping (String, UInt64, UInt64) -> Void
  ) async throws -> ExtractionResult {
    var extracted = 0
    var skipped = 0
    var writtenBytes: UInt64 = 0

    for item in plan {
      try Task.checkCancellation()

      let path = item.outputPath.normalized
      let entry = item.entry

      if entry.kind == "directory" {
        try await destination.prepareDirectory(at: path)
        extracted += 1
        onProgress(path, 0, 0)
        continue
      }

      guard entry.kind == "file" else {
        skipped += 1
        continue
      }

      guard entry.uncompressedSize <= limits.maxEntryUncompressedBytes else {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxEntryUncompressedBytes",
          value: "\(entry.uncompressedSize)"
        )
      }

      let data = try await engine.readEntry(
        session: session,
        path: entry.path,
        limit: limits.maxEntryUncompressedBytes,
        password: password
      )

      let fileURL = try await destination.createFile(at: path)
      try data.write(to: fileURL, options: .atomic)

      writtenBytes += UInt64(data.count)
      extracted += 1
      onProgress(path, UInt64(data.count), writtenBytes)
    }

    return ExtractionResult(
      extractedEntries: extracted,
      skippedEntries: skipped,
      writtenBytes: writtenBytes
    )
  }
}
