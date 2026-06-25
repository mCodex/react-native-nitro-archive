import Foundation
import NitroModules

final class HybridValidationTask: HybridNativeValidationTaskSpec {
  private let stateMachine = TaskStateMachine()
  private let operationId: String
  private let session: ArchiveEngineSession
  private let engine: ArchiveEngine
  private let request: NativeValidationRequest

  private var progressCallback: ((NativeProgress) -> Void)?

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
    request: NativeValidationRequest
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

  func start() throws -> Promise<NativeValidationResult> {
    Promise.async {
      try self.stateMachine.start()
      self.cachedState = "running"
      self.cachedProgress = NativeProgress(operationId: self.operationId, phase: "validating", processedBytes: 0, totalBytes: nil, processedEntries: 0, totalEntries: nil, currentEntry: nil, bytesPerSecond: nil, estimatedSecondsRemaining: nil, percentage: nil)

      let entries = self.session.entries
      let totalCount = entries.count
      let verifyChecksums = self.request.verifyChecksums ?? true
      let scanAllEntries = self.request.scanAllEntries ?? true
      let password = self.request.password

      self.emitProgress(phase: "validating", processedBytes: 0,
                         processedEntries: 0, currentEntry: nil,
                         totalEntries: totalCount)

      var issues: [NativeArchiveIssue] = []
      var checkedEntries = 0
      var checkedUncompressedBytes: UInt64 = 0
      var encryptedEntries = 0
      let startTime = CFAbsoluteTimeGetCurrent()
      let maxChecksumBytes: UInt64 = 64 * 1024 * 1024

      let entriesToValidate = scanAllEntries ? entries : entries.filter { $0.encrypted }

      for (index, entry) in entriesToValidate.enumerated() {
        try Task.checkCancellation()

        if entry.encrypted {
          encryptedEntries += 1
        }

        if verifyChecksums {
          if entry.encrypted && (password?.isEmpty ?? true) {
            issues.append(NativeArchiveIssue(
              code: "E_PASSWORD_REQUIRED",
              severity: "error",
              message: "Password is required to validate encrypted entry: \(entry.path)",
              entryPath: entry.path,
              entryIndex: Double(index)
            ))
            checkedEntries += 1
            continue
          }

          guard entry.uncompressedSize <= maxChecksumBytes else {
            issues.append(NativeArchiveIssue(
              code: "E_ARCHIVE_TOO_LARGE",
              severity: "warning",
              message: "Checksum validation skipped for large entry: \(entry.path)",
              entryPath: entry.path,
              entryIndex: Double(index)
            ))
            checkedEntries += 1
            continue
          }

          do {
            let maxBytes = max(entry.uncompressedSize, 1)
            let limit = min(maxBytes, maxChecksumBytes)
            _ = try await self.engine.readEntry(
              session: self.session,
              path: entry.path,
              limit: limit,
              password: password
            )
            checkedEntries += 1
            checkedUncompressedBytes += entry.uncompressedSize
          } catch let error as ArchiveDomainError {
            switch error {
            case .checksumMismatch:
              issues.append(NativeArchiveIssue(
                code: "E_CHECKSUM_MISMATCH",
                severity: "error",
                message: "Checksum validation failed for entry: \(entry.path)",
                entryPath: entry.path,
                entryIndex: Double(index)
              ))
            case .passwordRequired, .badPassword, .unsupportedEncryption:
              issues.append(NativeArchiveIssue(
                code: error.code,
                severity: "error",
                message: "\(error)",
                entryPath: entry.path,
                entryIndex: Double(index)
              ))
            case .bufferLimitExceeded, .entryNotFound:
              issues.append(NativeArchiveIssue(
                code: error.code,
                severity: "error",
                message: "\(error)",
                entryPath: entry.path,
                entryIndex: Double(index)
              ))
            default:
              throw error
            }
          }
        } else {
          checkedEntries += 1
          checkedUncompressedBytes += entry.uncompressedSize
        }

        self.emitProgress(phase: "validating", processedBytes: checkedUncompressedBytes,
                          processedEntries: index + 1, currentEntry: entry.path,
                          totalEntries: totalCount)
      }

      try self.stateMachine.succeed()
      self.cachedState = "succeeded"

      let duration = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
      let isValid = !issues.contains { $0.severity == "error" }

      self.emitProgress(phase: "finalizing", processedBytes: checkedUncompressedBytes,
                        processedEntries: checkedEntries, currentEntry: nil,
                        totalEntries: totalCount, percentage: 100)

      return NativeValidationResult(
        operationId: self.operationId,
        valid: isValid,
        checkedEntries: Double(checkedEntries),
        checkedUncompressedBytes: checkedUncompressedBytes,
        encryptedEntries: Double(encryptedEntries),
        durationMs: duration,
        issues: issues
      )
    }
  }

  func cancel() throws -> Bool {
    let didCancel = stateMachine.cancel()
    if didCancel {
      cachedState = "cancelled"
      cachedProgress = NativeProgress(operationId: operationId, phase: "cleaning-up",
                                       processedBytes: 0, totalBytes: nil,
                                       processedEntries: 0, totalEntries: nil,
                                       currentEntry: nil, bytesPerSecond: nil,
                                       estimatedSecondsRemaining: nil, percentage: nil)
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
