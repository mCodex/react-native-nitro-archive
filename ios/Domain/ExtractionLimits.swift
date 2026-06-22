import Foundation

struct ExtractionLimits {
  let maxEntries: Int
  let maxTotalUncompressedBytes: UInt64
  let maxEntryUncompressedBytes: UInt64
  let maxCompressionRatio: Int
  let maxPathDepth: Int
  let maxPathBytes: Int

  static let `default` = ExtractionLimits(
    maxEntries: 10000,
    maxTotalUncompressedBytes: 2_147_483_648,
    maxEntryUncompressedBytes: 536_870_912,
    maxCompressionRatio: 1000,
    maxPathDepth: 32,
    maxPathBytes: 1024
  )

  init(
    maxEntries: Int = 10000,
    maxTotalUncompressedBytes: UInt64 = 2_147_483_648,
    maxEntryUncompressedBytes: UInt64 = 536_870_912,
    maxCompressionRatio: Int = 1000,
    maxPathDepth: Int = 32,
    maxPathBytes: Int = 1024
  ) {
    self.maxEntries = maxEntries
    self.maxTotalUncompressedBytes = maxTotalUncompressedBytes
    self.maxEntryUncompressedBytes = maxEntryUncompressedBytes
    self.maxCompressionRatio = maxCompressionRatio
    self.maxPathDepth = maxPathDepth
    self.maxPathBytes = maxPathBytes
  }
}
