import Foundation

final class ExtractionPlanner {
  func planExtraction(
    entries: [EntryDescriptor],
    include: [String]?,
    exclude: [String]?,
    limits: ExtractionLimits,
    destination: URL
  ) throws -> [ExtractionPlanItem] {
    guard entries.count <= limits.maxEntries else {
      throw ArchiveDomainError.extractionLimitExceeded(limit: "maxEntries", value: "\(entries.count)")
    }

    var planned: [ExtractionPlanItem] = []
    var totalBytes: UInt64 = 0
    var duplicateTracker = DuplicatePathPolicy()

    for entry in entries {
      let normalizedPath = try ArchivePath(raw: entry.path)
      _ = try duplicateTracker.check(normalizedPath.normalized)

      guard normalizedPath.components.count <= limits.maxPathDepth else {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxPathDepth",
          value: "\(normalizedPath.components.count)"
        )
      }

      let pathBytes = normalizedPath.normalized.lengthOfBytes(using: .utf8)
      guard pathBytes <= limits.maxPathBytes else {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxPathBytes",
          value: "\(pathBytes)"
        )
      }

      if let include = include {
        let matched = include.contains { pattern in
          fnmatch(pattern, normalizedPath.normalized, 0) == 0
        }
        guard matched else { continue }
      }

      if let exclude = exclude {
        let excluded = exclude.contains { pattern in
          fnmatch(pattern, normalizedPath.normalized, 0) == 0
        }
        guard !excluded else { continue }
      }

      guard entry.uncompressedSize <= limits.maxEntryUncompressedBytes else {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxEntryUncompressedBytes",
          value: "\(entry.uncompressedSize)"
        )
      }

      if entry.compressedSize == 0 && entry.uncompressedSize > 0 {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxCompressionRatio",
          value: "infinite"
        )
      }

      if entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > UInt64(limits.maxCompressionRatio) {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxCompressionRatio",
          value: "\(entry.uncompressedSize / entry.compressedSize)"
        )
      }

      let (newTotalBytes, overflow) = totalBytes.addingReportingOverflow(entry.uncompressedSize)
      guard !overflow else {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxTotalUncompressedBytes",
          value: "overflow"
        )
      }
      totalBytes = newTotalBytes
      guard totalBytes <= limits.maxTotalUncompressedBytes else {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxTotalUncompressedBytes",
          value: "\(totalBytes)"
        )
      }

      planned.append(ExtractionPlanItem(entry: entry, outputPath: normalizedPath))
    }

    return planned
  }
}

struct ExtractionPlanItem {
  let entry: EntryDescriptor
  let outputPath: ArchivePath
}

private func fnmatch(_ pattern: String, _ string: String, _ flags: Int32) -> Int32 {
  var p = pattern
  var s = string

  while !p.isEmpty {
    let pChar = p.removeFirst()
    if pChar == "*" {
      if p.isEmpty { return 0 }
      while !s.isEmpty {
        if fnmatch(p, s, 0) == 0 { return 0 }
        s.removeFirst()
      }
      return -1
    } else if pChar == "?" {
      if s.isEmpty { return -1 }
      s.removeFirst()
    } else {
      if s.isEmpty || s.removeFirst() != pChar { return -1 }
    }
  }
  return s.isEmpty ? 0 : -1
}
