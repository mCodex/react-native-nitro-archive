import Foundation

func parseNativeByteCount(_ value: Double?, default defaultValue: UInt64) throws -> UInt64 {
  guard let value else { return defaultValue }
  guard value.isFinite, value >= 0, value <= 9_007_199_254_740_991, value.rounded(.towardZero) == value else {
    throw ArchiveDomainError.invalidArgument("Byte count must be a nonnegative safe integer")
  }
  return UInt64(value)
}
