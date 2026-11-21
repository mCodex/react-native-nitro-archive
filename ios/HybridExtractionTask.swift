import Foundation
import NitroModules

final class HybridExtractionTask: HybridNativeExtractionTaskSpec {
  private let stateMachine = TaskStateMachine()
  private let operationId: String
  private let session: ArchiveEngineSession
  private let engine: ArchiveEngine
  private let request: NativeExtractionRequest
  private let progressReporter: NativeTaskProgress

  var state: String { stateMachine.state.rawValue }
  var progress: NativeProgress { progressReporter.snapshot }

  init(session: ArchiveEngineSession, engine: ArchiveEngine, request: NativeExtractionRequest) {
    let id = UUID().uuidString
    operationId = id
    self.session = session
    self.engine = engine
    self.request = request
    progressReporter = NativeTaskProgress(operationId: id, intervalMs: request.progressIntervalMs)
    super.init()
  }

  func start() throws -> Promise<NativeExtractionResult> {
    Promise.async {
      do {
        try self.stateMachine.start()
      } catch let error as ArchiveDomainError {
        return self.failure(error)
      }

      var output: SafeDirectoryOutput?
      do {
        try self.stateMachine.checkCancellation()
        guard self.request.destinationKind == "directory", let path = self.request.destinationPath else {
          throw ArchiveDomainError.providerUnsupported
        }
        let limits = try self.resolveLimits()
        let url = URL(fileURLWithPath: path)
        let archive = self.session.inspection
        let solidCompression = archive.format == "tar.gz"
        if solidCompression,
           let compressed = archive.compressedSize, let expanded = archive.totalUncompressedSize,
           exceedsCompressionRatio(expanded, compressed, limits.maxCompressionRatio) {
          throw ArchiveDomainError.extractionLimitExceeded(limit: "maxCompressionRatio", value: "exceeded")
        }

        let entries = try self.request.entries.map { paths in
          var seen = Set<String>()
          return try paths.filter { seen.insert($0).inserted }.map { path in
            guard let entry = self.session.entry(at: path) else {
              throw ArchiveDomainError.entryNotFound(path)
            }
            return entry
          }
        } ?? self.session.entries
        let plan = try ExtractionPlanner().planExtraction(
          entries: entries, include: self.request.include, exclude: self.request.exclude,
          limits: limits, destination: url,
          checkEntryCompressionRatio: !solidCompression
        )
        let destination = SafeDirectoryOutput(baseURL: url)
        output = destination

        let start = ProcessInfo.processInfo.systemUptime
        self.progressReporter.emit(phase: "extracting", totalEntries: plan.count)
        let result = try await ExtractArchiveUseCase(engine: self.engine).execute(
          session: self.session, plan: plan, destination: destination,
          limits: limits, password: self.request.password,
          checkCancellation: { try self.stateMachine.checkCancellation() },
          onProgress: { entry, bytes, count in
            self.progressReporter.emit(
              phase: "extracting", bytes: bytes, entries: UInt64(count),
              currentEntry: entry, totalEntries: plan.count
            )
          }
        )
        try self.stateMachine.beginCommit()
        try await destination.commit()
        try self.stateMachine.succeed()

        self.progressReporter.emit(
          phase: "finalizing", bytes: result.writtenBytes, entries: UInt64(result.extractedEntries),
          totalEntries: plan.count, complete: true
        )
        return NativeExtractionResult(
          operationId: self.operationId, extractedEntries: Double(result.extractedEntries),
          skippedEntries: Double(result.skippedEntries), writtenBytes: Double(result.writtenBytes),
          durationMs: (ProcessInfo.processInfo.systemUptime - start) * 1000,
          atomicWriteApplied: false, warnings: [], error: nil
        )
      } catch {
        let cancelled = (error as? ArchiveDomainError) == .operationCancelled ||
          self.stateMachine.state == .cancelling
        if (cancelled ? self.request.cleanupOnCancel : self.request.cleanupOnError) ?? true {
          try? await output?.rollback()
        }
        self.stateMachine.fail(cancelled: cancelled)
        if cancelled { return self.failure(.operationCancelled) }
        if let domain = error as? ArchiveDomainError { return self.failure(domain) }
        throw error
      }
    }
  }

  private func failure(_ error: ArchiveDomainError) -> NativeExtractionResult {
    NativeExtractionResult(
      operationId: operationId, extractedEntries: 0, skippedEntries: 0, writtenBytes: 0,
      durationMs: 0, atomicWriteApplied: false, warnings: [], error: nativeArchiveFailure(error, operationId: operationId)
    )
  }

  func cancel() throws -> Bool { stateMachine.cancel() }

  func onProgress(callback: @escaping (NativeProgress) -> Void) throws -> () -> Void {
    progressReporter.setCallback(callback)
    return { [weak self] in self?.progressReporter.setCallback(nil) }
  }

  private func resolveLimits() throws -> ExtractionLimits {
    guard let limits = request.limits else { return .default }

    return ExtractionLimits(
      maxEntries: try parseNativePositiveInt(limits.maxEntries, default: 10_000),
      maxTotalUncompressedBytes: try parseNativeByteCount(limits.maxTotalUncompressedBytes, default: 2_147_483_648),
      maxEntryUncompressedBytes: try parseNativeByteCount(limits.maxEntryUncompressedBytes, default: 536_870_912),
      maxCompressionRatio: try parseNativePositiveInt(limits.maxCompressionRatio, default: 1000),
      maxPathDepth: try parseNativePositiveInt(limits.maxPathDepth, default: 32),
      maxPathBytes: try parseNativePositiveInt(limits.maxPathBytes, default: 1024)
    )
  }
}
