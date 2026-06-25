import Foundation
import NitroModules

final class HybridCreationTask: HybridNativeCreationTaskSpec {
  private let stateMachine = TaskStateMachine()
  private let operationId: String
  private let engine: ArchiveEngine
  private let request: NativeCreationRequest
  private let useCase: CreateArchiveUseCase
  // ponytail: copy buffers on JS thread before background hop (JSArrayBuffer thread check)
  private let copiedData: [Data?]

  private var progressCallback: ((NativeProgress) -> Void)?

  private var cachedState: String = "idle"
  private var cachedProgress: NativeProgress

  var state: String {
    cachedState
  }

  var progress: NativeProgress {
    cachedProgress
  }

  init(engine: ArchiveEngine, request: NativeCreationRequest) {
    self.operationId = UUID().uuidString
    self.engine = engine
    self.request = request
    self.useCase = CreateArchiveUseCase(engine: engine)
    // ponytail: copy ArrayBuffer data while still on JS thread
    self.copiedData = request.entries.map { entry in
      entry.data.map { Data(bytes: $0.data, count: $0.size) }
    }
    self.cachedProgress = NativeProgress(
      operationId: "",
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

  func start() throws -> Promise<NativeCreationResult> {
    Promise.async {
      try self.stateMachine.start()
      self.cachedState = "running"
      let startTime = CFAbsoluteTimeGetCurrent()

      do {
        self.emitProgress(phase: "preparing")

        guard self.request.destinationKind == "file", let destinationPath = self.request.destinationPath else {
          throw ArchiveDomainError.providerUnsupported
        }

        if self.request.existingDestination == "error",
           FileManager.default.fileExists(atPath: destinationPath) {
          throw ArchiveDomainError.destinationExists(destinationPath)
        }

        let entryInputs = self.request.entries.enumerated().map { idx, nativeEntry -> EntryInput in
          EntryInput(
            kind: nativeEntry.kind,
            sourcePath: nativeEntry.sourcePath,
            archivePath: nativeEntry.archivePath,
            data: self.copiedData[idx],
            recursive: nativeEntry.recursive,
            includeHidden: nativeEntry.includeHidden,
            followSymlinks: nativeEntry.followSymlinks,
            compressionMethod: nativeEntry.compressionMethod,
            modifiedAt: nativeEntry.modifiedAt
          )
        }

        let plan = CreationPlan(
          entries: entryInputs,
          compressionProfile: self.request.compressionProfile,
          compressionLevel: self.request.compressionLevel.map(Int.init),
          storeAlreadyCompressed: self.request.storeAlreadyCompressed ?? true,
          encryptionMethod: self.request.encryptionMethod,
          encryptionPassword: self.request.encryptionPassword
        )

        let output = LocalFileOutput(path: destinationPath)

        self.emitProgress(phase: "compressing")

        let result = try await self.useCase.execute(
          plan: plan,
          output: output,
          onProgress: { snapshot in
            self.emitProgress(
              phase: "compressing",
              processedBytes: snapshot.processedBytes,
              processedEntries: snapshot.processedEntries,
              currentEntry: snapshot.currentEntry,
              totalEntries: snapshot.totalEntries
            )
          }
        )

        self.emitProgress(phase: "finalizing")
        try self.stateMachine.succeed()
        self.cachedState = "succeeded"

        let duration = (CFAbsoluteTimeGetCurrent() - startTime) * 1000

        self.emitProgress(
          phase: "finalizing",
          processedBytes: result.inputBytes,
          processedEntries: result.entryCount,
          currentEntry: nil,
          totalEntries: result.entryCount,
          percentage: 100
        )

        return NativeCreationResult(
          operationId: self.operationId,
          entryCount: Double(result.entryCount),
          inputBytes: result.inputBytes,
          outputBytes: result.outputBytes,
          durationMs: duration,
          atomicWriteApplied: false,
          warnings: []
        )
      } catch {
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
    }
    return didCancel
  }

  func onProgress(callback: @escaping (NativeProgress) -> Void) throws -> () -> Void {
    progressCallback = callback
    return { [weak self] in
      self?.progressCallback = nil
    }
  }

  private func emitProgress(
    phase: String,
    processedBytes: UInt64 = 0,
    processedEntries: Int = 0,
    currentEntry: String? = nil,
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
