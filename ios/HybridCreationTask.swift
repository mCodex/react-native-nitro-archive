import Foundation
import NitroModules

final class HybridCreationTask: HybridNativeCreationTaskSpec {
  private let stateMachine = TaskStateMachine()
  private var progressCallback: ((NativeProgress) -> Void)?

  private var cachedState: String = "idle"
  private var cachedProgress: NativeProgress

  var state: String {
    cachedState
  }

  var progress: NativeProgress {
    cachedProgress
  }

  override init() {
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
      throw ArchiveDomainError.unsupportedFormat("Archive creation not yet implemented")
    }
  }

  func cancel() throws -> Bool {
    stateMachine.cancel()
  }

  func onProgress(callback: @escaping (NativeProgress) -> Void) throws -> () -> Void {
    progressCallback = callback
    return { [weak self] in
      self?.progressCallback = nil
    }
  }
}
