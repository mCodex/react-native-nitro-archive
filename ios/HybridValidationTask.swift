import Foundation
import NitroModules

final class HybridValidationTask: HybridNativeValidationTaskSpec {
  private let stateMachine = TaskStateMachine()
  private let operationId: String
  private let session: ArchiveEngineSession
  private let engine: ArchiveEngine
  private let request: NativeValidationRequest

  private let progressReporter: NativeTaskProgress

  var state: String { stateMachine.state.rawValue }
  var progress: NativeProgress { progressReporter.snapshot }

  init(
    session: ArchiveEngineSession,
    engine: ArchiveEngine,
    request: NativeValidationRequest
  ) {
    let opId = UUID().uuidString
    self.operationId = opId
    self.session = session
    self.engine = engine
    self.request = request
    progressReporter = NativeTaskProgress(operationId: opId, intervalMs: request.progressIntervalMs)
    super.init()
  }

  func start() throws -> Promise<NativeValidationResult> {
    Promise.async {
      do {
        try self.stateMachine.start()
      } catch let error as ArchiveDomainError {
        return self.failure(error)
      }
      defer { self.stateMachine.fail() }
      do {
        let entries = self.session.entries
        let nativeLimits = self.request.limits
        let limits = ExtractionLimits(
          maxEntries: try parseNativePositiveInt(nativeLimits?.maxEntries, default: 10_000),
          maxTotalUncompressedBytes: try parseNativeByteCount(nativeLimits?.maxTotalUncompressedBytes, default: 2_147_483_648),
          maxEntryUncompressedBytes: try parseNativeByteCount(nativeLimits?.maxEntryUncompressedBytes, default: 536_870_912),
          maxCompressionRatio: try parseNativePositiveInt(nativeLimits?.maxCompressionRatio, default: 1000),
          maxPathDepth: try parseNativePositiveInt(nativeLimits?.maxPathDepth, default: 32),
          maxPathBytes: try parseNativePositiveInt(nativeLimits?.maxPathBytes, default: 1024)
        )
        let inspection = self.session.inspection
        let solidCompression = inspection.format == "tar.gz"
        if solidCompression,
           let compressed = inspection.compressedSize, let expanded = inspection.totalUncompressedSize,
           exceedsCompressionRatio(expanded, compressed, limits.maxCompressionRatio) {
          throw ArchiveDomainError.extractionLimitExceeded(limit: "maxCompressionRatio", value: "exceeded")
        }
        _ = try ExtractionPlanner().planExtraction(entries: entries, include: nil, exclude: nil,
          limits: limits, destination: URL(fileURLWithPath: "/"), checkEntryCompressionRatio: !solidCompression)
        let verifyChecksums = self.request.verifyChecksums ?? true
        let entriesToValidate = (self.request.scanAllEntries ?? true) ? entries : entries.filter { $0.encrypted }
        let totalEntries = entriesToValidate.count
        let workspace = verifyChecksums ? try ArchiveWorkspace() : nil
        defer { withExtendedLifetime(workspace) {} }

        self.progressReporter.emit(phase: "validating", totalEntries: totalEntries)
        let start = ProcessInfo.processInfo.systemUptime
        var issues: [NativeArchiveIssue] = []
        var checkedEntries = 0
        var checkedUncompressedBytes: UInt64 = 0
        var encryptedEntries = 0

        for entry in entriesToValidate {
          try self.stateMachine.checkCancellation()
          if entry.encrypted { encryptedEntries += 1 }

          do {
            if entry.kind == "symlink" || entry.kind == "hardlink" {
              throw ArchiveDomainError.unsafeSymlink(entry.path)
            }
            guard entry.kind == "file" || entry.kind == "directory" else {
              throw ArchiveDomainError.specialFile(entry.path)
            }
            if let workspace, entry.kind == "file" {
              try self.verify(entry, in: workspace, limit: limits.maxEntryUncompressedBytes)
            }
            checkedUncompressedBytes += entry.uncompressedSize
          } catch let error as ArchiveDomainError {
            switch error {
            case .checksumMismatch, .passwordRequired, .badPassword, .unsupportedEncryption,
                 .unsupportedCompression, .entryNotFound, .bufferLimitExceeded, .unsafeSymlink, .specialFile:
              issues.append(NativeArchiveIssue(
                code: error.code, severity: "error", message: "\(error)",
                entryPath: entry.path, entryIndex: Double(entry.index)
              ))
            default:
              throw error
            }
          }

          checkedEntries += 1
          self.progressReporter.emit(
            phase: "validating", bytes: checkedUncompressedBytes, entries: UInt64(checkedEntries),
            currentEntry: entry.path, totalEntries: totalEntries
          )
        }

        try self.stateMachine.succeed()

        let duration = (ProcessInfo.processInfo.systemUptime - start) * 1000
        let isValid = !issues.contains { $0.severity == "error" }

        self.progressReporter.emit(
          phase: "finalizing", bytes: checkedUncompressedBytes, entries: UInt64(checkedEntries),
          totalEntries: totalEntries, complete: true
        )

        return NativeValidationResult(
          operationId: self.operationId,
          valid: isValid,
          checkedEntries: Double(checkedEntries),
          checkedUncompressedBytes: Double(checkedUncompressedBytes),
          encryptedEntries: Double(encryptedEntries),
          durationMs: duration,
          issues: issues, error: nil
        )
      } catch let error as ArchiveDomainError {
        self.stateMachine.fail(cancelled: error == .operationCancelled)
        return self.failure(error)
      }
    }
  }

  private func failure(_ error: ArchiveDomainError) -> NativeValidationResult {
    NativeValidationResult(
      operationId: operationId, valid: false, checkedEntries: 0, checkedUncompressedBytes: 0,
      encryptedEntries: 0, durationMs: 0, issues: [], error: nativeArchiveFailure(error, operationId: operationId)
    )
  }

  private func verify(_ entry: EntryDescriptor, in workspace: ArchiveWorkspace, limit: UInt64) throws {
    let url = workspace.directory.appendingPathComponent("verify")
    let output = try workspace.createFile(at: url)
    defer {
      try? output.close()
      try? FileManager.default.removeItem(at: url)
    }

    let written = try engine.extractEntry(
      session: session, path: entry.path, outputFd: output.fileDescriptor,
      limit: limit, password: request.password
    ) { _, _ in
      (try? self.stateMachine.checkCancellation()) != nil
    }
    guard written == entry.uncompressedSize else {
      throw ArchiveDomainError.invalidArchive("Verified size does not match indexed metadata")
    }
  }

  func cancel() throws -> Bool { stateMachine.cancel() }

  func onProgress(callback: @escaping (NativeProgress) -> Void) throws -> () -> Void {
    progressReporter.setCallback(callback)
    return { [weak self] in self?.progressReporter.setCallback(nil) }
  }
}
