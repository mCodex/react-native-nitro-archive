import Foundation

struct ProgressSnapshot {
  let operationId: String
  let phase: String
  let processedBytes: UInt64
  let totalBytes: UInt64?
  let processedEntries: Int
  let totalEntries: Int?
  let currentEntry: String?
  let bytesPerSecond: Double?
  let estimatedSecondsRemaining: Double?
  let percentage: Double?

  init(
    operationId: String,
    phase: String = "preparing",
    processedBytes: UInt64 = 0,
    totalBytes: UInt64? = nil,
    processedEntries: Int = 0,
    totalEntries: Int? = nil,
    currentEntry: String? = nil,
    bytesPerSecond: Double? = nil,
    estimatedSecondsRemaining: Double? = nil
  ) {
    self.operationId = operationId
    self.phase = phase
    self.processedBytes = processedBytes
    self.totalBytes = totalBytes
    self.processedEntries = processedEntries
    self.totalEntries = totalEntries
    self.currentEntry = currentEntry
    self.bytesPerSecond = bytesPerSecond
    self.estimatedSecondsRemaining = estimatedSecondsRemaining

    if let total = totalBytes, total > 0 {
      self.percentage = min(Double(processedBytes) / Double(total) * 100.0, 100.0)
    } else if let total = totalEntries, total > 0 {
      self.percentage = min(Double(processedEntries) / Double(total) * 100.0, 100.0)
    } else {
      self.percentage = nil
    }
  }
}
