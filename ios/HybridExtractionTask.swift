import Foundation
import NitroModules

final class HybridExtractionTask: HybridNativeExtractionTaskSpec {
  private let stateMachine = TaskStateMachine()
  private let operationId: String
  private let session: ArchiveEngineSession
  private let engine: ArchiveEngine
  private let request: NativeExtractionRequest

  private var progressCallback: ((NativeProgress) -> Void)?
  private var safeOutput: SafeDirectoryOutput?

  private var cachedState: String = "idle"
  private var cachedProgress: NativeProgress

  var state: String {
    cachedState
  }

  var progress: NativeProgress {
    cachedProgress
  }

  init(
    session: ArchiveEngineSession,
    engine: ArchiveEngine,
    request: NativeExtractionRequest
  ) {
    let opId = UUID().uuidString
    self.operationId = opId
    self.session = session
    self.engine = engine
    self.request = request
    self.cachedProgress = NativeProgress(
      operationId: opId,
      phase: "preparing",
      processedBytes: 0,
      totalBytes: nil,
      processedEntries: 0,
      totalEntries: nil,
      currentEntry: nil,
      bytesPerSecond: nil,
      estimatedSecondsRemaining: nil,
      percentage: nil
    )
    super.init()
  }

  func start() throws -> Promise<NativeExtractionResult> {
    Promise.async {
      try self.stateMachine.start()
      self.cachedState = "running"

      let destinationPath: String
      if let path = self.request.destinationPath {
        destinationPath = path
      } else {
        throw ArchiveDomainError.invalidArgument("No destination path provided")
      }

      let limits = self.resolveLimits()
      let planner = ExtractionPlanner()
      let plan = try planner.planExtraction(
        entries: self.session.entries,
        include: self.request.include,
        exclude: self.request.exclude,
        limits: limits,
        destination: URL(fileURLWithPath: destinationPath)
      )

      let totalEntriesCount = plan.count
      self.emitProgress(phase: "extracting", processedBytes: 0, processedEntries: 0,
                         currentEntry: nil, totalEntries: totalEntriesCount)

      let output = SafeDirectoryOutput(baseURL: URL(fileURLWithPath: destinationPath))
      self.safeOutput = output

      let useCase = ExtractArchiveUseCase(engine: self.engine)
      let startTime = CFAbsoluteTimeGetCurrent()
      var extractedSoFar = 0

      do {
        let result = try await useCase.execute(
          session: self.session,
          plan: plan,
          destination: output,
          limits: limits,
          password: self.request.password,
          onProgress: { [weak self] entryPath, _, totalWritten in
            guard let self else { return }
            extractedSoFar += 1
            self.emitProgress(phase: "extracting", processedBytes: totalWritten,
                              processedEntries: extractedSoFar,
                              currentEntry: entryPath, totalEntries: totalEntriesCount)
          }
        )

        try Task.checkCancellation()
        try await output.commit()

        let duration = (CFAbsoluteTimeGetCurrent() - startTime) * 1000

        try self.stateMachine.succeed()
        self.cachedState = "succeeded"
        self.emitProgress(phase: "finalizing", processedBytes: result.writtenBytes,
                          processedEntries: result.extractedEntries,
                          currentEntry: nil, totalEntries: totalEntriesCount,
                          percentage: 100)

        return NativeExtractionResult(
          operationId: self.operationId,
          extractedEntries: Double(result.extractedEntries),
          skippedEntries: Double(result.skippedEntries),
          writtenBytes: result.writtenBytes,
          durationMs: duration,
          atomicWriteApplied: true,
          warnings: []
        )
      } catch {
        if self.request.cleanupOnError ?? true {
          try? await output.rollback()
        }
        self.stateMachine.fail()
        self.cachedState = "failed"
        throw error
      }
    }
  }

  func cancel() throws -> Bool {
    let didCancel = stateMachine.cancel()
    if didCancel {
      cachedState = "cancelled"
      emitProgress(phase: "cleaning-up", processedBytes: 0,
                    processedEntries: 0, currentEntry: nil)

      if request.cleanupOnCancel ?? true {
        Task {
          try? await safeOutput?.rollback()
        }
      }
    }
    return didCancel
  }

  func onProgress(callback: @escaping (NativeProgress) -> Void) throws -> () -> Void {
    progressCallback = callback
    return { [weak self] in
      self?.progressCallback = nil
    }
  }

  private func resolveLimits() -> ExtractionLimits {
    guard let nativeLimits = request.limits else { return .default }
    return ExtractionLimits(
      maxEntries: nativeLimits.maxEntries.map(Int.init) ?? 10000,
      maxTotalUncompressedBytes: nativeLimits.maxTotalUncompressedBytes ?? 2_147_483_648,
      maxEntryUncompressedBytes: nativeLimits.maxEntryUncompressedBytes ?? 536_870_912,
      maxCompressionRatio: nativeLimits.maxCompressionRatio.map(Int.init) ?? 1000,
      maxPathDepth: nativeLimits.maxPathDepth.map(Int.init) ?? 32,
      maxPathBytes: nativeLimits.maxPathBytes.map(Int.init) ?? 1024
    )
  }

  private func emitProgress(
    phase: String,
    processedBytes: UInt64,
    processedEntries: Int,
    currentEntry: String?,
    totalEntries: Int? = nil,
    percentage: Double? = nil
  ) {
    let total = totalEntries.map(Double.init)
    let pct: Double?
    if let p = percentage {
      pct = p
    } else if let t = total, t > 0 {
      pct = min(Double(processedEntries) / t * 100, 100)
    } else {
      pct = nil
    }

    let snapshot = NativeProgress(
      operationId: operationId,
      phase: phase,
      processedBytes: processedBytes,
      totalBytes: nil,
      processedEntries: Double(processedEntries),
      totalEntries: total,
      currentEntry: currentEntry,
      bytesPerSecond: nil,
      estimatedSecondsRemaining: nil,
      percentage: pct
    )

    cachedProgress = snapshot
    progressCallback?(snapshot)
  }
}
