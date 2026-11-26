import Foundation

// Rust inspection has already checked the JavaScript safe-integer limit.
func nativeByteCount(_ bytes: UInt64?) -> Double? {
  bytes.map { Double($0) }
}

func parseNativeByteCount(_ value: Double?, default defaultValue: UInt64) throws -> UInt64 {
  guard let value else { return defaultValue }
  guard value.isFinite, value >= 0, value <= 9_007_199_254_740_991, value.rounded(.towardZero) == value else {
    throw ArchiveDomainError.invalidArgument("Byte count must be a nonnegative safe integer")
  }
  return UInt64(value)
}

func parseNativePositiveInt(_ value: Double?, default defaultValue: Int) throws -> Int {
  guard let value else { return defaultValue }
  guard let integer = Int(exactly: value), integer > 0, value <= 9_007_199_254_740_991 else {
    throw ArchiveDomainError.invalidArgument("Expected a positive safe integer")
  }
  return integer
}
