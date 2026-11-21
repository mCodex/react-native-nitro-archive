import Foundation

final class NativeTaskProgress {
  private let lock = NSLock()
  private let interval: TimeInterval
  private var latest: NativeProgress
  private var lastEmission: TimeInterval = 0
  private var callback: ((NativeProgress) -> Void)?

  init(operationId: String, intervalMs: Double?) {
    self.interval = (intervalMs ?? 100) / 1000
    latest = NativeProgress(
      operationId: operationId, phase: "preparing", processedBytes: 0, totalBytes: nil,
      processedEntries: 0, totalEntries: nil, currentEntry: nil,
      bytesPerSecond: nil, estimatedSecondsRemaining: nil, percentage: nil
    )
  }

  var snapshot: NativeProgress {
    lock.withLock { latest }
  }

  func setCallback(_ callback: ((NativeProgress) -> Void)?) {
    lock.withLock { self.callback = callback }
  }

  func emit(
    phase: String, bytes: UInt64 = 0, entries: UInt64 = 0, currentEntry: String? = nil,
    totalEntries: Int? = nil, complete: Bool = false
  ) {
    let now = ProcessInfo.processInfo.systemUptime
    let total = totalEntries.map(Double.init)
    let percentage = complete ? 100 : total.flatMap { $0 > 0 ? min(Double(entries) / $0 * 100, 100) : nil }

    let delivery: (((NativeProgress) -> Void), NativeProgress)? = lock.withLock {
      let phaseChanged = latest.phase != phase
      latest = NativeProgress(
        operationId: latest.operationId, phase: phase, processedBytes: Double(bytes),
        totalBytes: nil, processedEntries: Double(entries), totalEntries: total,
        currentEntry: currentEntry, bytesPerSecond: nil, estimatedSecondsRemaining: nil, percentage: percentage
      )
      guard let callback, complete || phaseChanged || now - lastEmission >= interval else { return nil }
      lastEmission = now
      return (callback, latest)
    }

    if let (callback, snapshot) = delivery { callback(snapshot) }
  }
}
