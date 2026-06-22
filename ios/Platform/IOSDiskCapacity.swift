import Foundation

struct IOSDiskCapacity {
  static func freeBytes(at url: URL) -> UInt64? {
    let resourceKeys: [URLResourceKey] = [.volumeAvailableCapacityForImportantUsageKey]
    let values = try? url.resourceValues(forKeys: Set(resourceKeys))
    if let capacity = values?.volumeAvailableCapacityForImportantUsage {
      return UInt64(capacity)
    }
    let fallbackKeys: [URLResourceKey] = [.volumeAvailableCapacityKey]
    let fallbackValues = try? url.resourceValues(forKeys: Set(fallbackKeys))
    if let capacity = fallbackValues?.volumeAvailableCapacity {
      return UInt64(capacity)
    }
    return nil
  }
}
