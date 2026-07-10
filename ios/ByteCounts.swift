import Foundation

func nativeByteCount(_ value: UInt64) -> String {
  String(value)
}

func parseNativeByteCount(_ value: String?, default defaultValue: UInt64) -> UInt64 {
  guard let value, let parsed = UInt64(value) else { return defaultValue }
  return parsed
}
