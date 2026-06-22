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
      try duplicateTracker.check(normalizedPath.normalized)

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

      totalBytes += entry.uncompressedSize
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
