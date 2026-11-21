import Foundation

final class ExtractionPlanner {
  func planExtraction(
    entries: [EntryDescriptor],
    include: [String]?,
    exclude: [String]?,
    limits: ExtractionLimits,
    destination: URL,
    checkEntryCompressionRatio: Bool = true
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
          ArchiveGlob.matches(pattern: pattern, path: normalizedPath.normalized)
        }
        guard matched else { continue }
      }

      if let exclude = exclude {
        let excluded = exclude.contains { pattern in
          ArchiveGlob.matches(pattern: pattern, path: normalizedPath.normalized)
        }
        guard !excluded else { continue }
      }

      guard entry.uncompressedSize <= limits.maxEntryUncompressedBytes else {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxEntryUncompressedBytes",
          value: "\(entry.uncompressedSize)"
        )
      }

      if checkEntryCompressionRatio, entry.compressedSize == 0 && entry.uncompressedSize > 0 {
        throw ArchiveDomainError.extractionLimitExceeded(
          limit: "maxCompressionRatio",
          value: "infinite"
        )
      }

      if checkEntryCompressionRatio, entry.compressedSize > 0 &&
         exceedsCompressionRatio(entry.uncompressedSize, entry.compressedSize, limits.maxCompressionRatio) {
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

func exceedsCompressionRatio(_ expanded: UInt64, _ compressed: UInt64, _ maximum: Int) -> Bool {
  if compressed == 0 { return expanded > 0 }
  let ratio = expanded.quotientAndRemainder(dividingBy: compressed)
  let limit = UInt64(maximum)
  return ratio.quotient > limit || (ratio.quotient == limit && ratio.remainder > 0)
}

struct ExtractionPlanItem {
  let entry: EntryDescriptor
  let outputPath: ArchivePath
}

enum ArchiveGlob {
  static func matches(pattern: String, path: String) -> Bool {
    expandBraces(pattern).contains { expanded in
      matchesComponents(
        pattern: expanded.split(separator: "/", omittingEmptySubsequences: false).map(String.init),
        path: path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
      )
    }
  }

  private static func matchesComponents(pattern: [String], path: [String]) -> Bool {
    var memo: [ComponentPosition: Bool] = [:]

    func match(patternIndex: Int, pathIndex: Int) -> Bool {
      let position = ComponentPosition(pattern: patternIndex, path: pathIndex)
      if let cached = memo[position] { return cached }

      let result: Bool
      if patternIndex == pattern.count {
        result = pathIndex == path.count
      } else if pattern[patternIndex] == "**" {
        result = match(patternIndex: patternIndex + 1, pathIndex: pathIndex)
          || (pathIndex < path.count && match(patternIndex: patternIndex, pathIndex: pathIndex + 1))
      } else {
        result = pathIndex < path.count
          && matchesComponent(pattern: pattern[patternIndex], value: path[pathIndex])
          && match(patternIndex: patternIndex + 1, pathIndex: pathIndex + 1)
      }

      memo[position] = result
      return result
    }

    return match(patternIndex: 0, pathIndex: 0)
  }

  private static func matchesComponent(pattern: String, value: String) -> Bool {
    let patternCharacters = Array(pattern)
    let valueCharacters = Array(value)
    var matches = Array(
      repeating: Array(repeating: false, count: valueCharacters.count + 1),
      count: patternCharacters.count + 1
    )
    matches[0][0] = true

    guard !patternCharacters.isEmpty else { return valueCharacters.isEmpty }

    for patternIndex in 1...patternCharacters.count {
      if patternCharacters[patternIndex - 1] == "*" {
        matches[patternIndex][0] = matches[patternIndex - 1][0]
      }

      guard !valueCharacters.isEmpty else { continue }

      for valueIndex in 1...valueCharacters.count {
        switch patternCharacters[patternIndex - 1] {
        case "*":
          matches[patternIndex][valueIndex] =
            matches[patternIndex - 1][valueIndex] || matches[patternIndex][valueIndex - 1]
        case "?":
          matches[patternIndex][valueIndex] = matches[patternIndex - 1][valueIndex - 1]
        default:
          matches[patternIndex][valueIndex] =
            patternCharacters[patternIndex - 1] == valueCharacters[valueIndex - 1]
            && matches[patternIndex - 1][valueIndex - 1]
        }
      }
    }

    return matches[patternCharacters.count][valueCharacters.count]
  }

  private static func expandBraces(_ pattern: String) -> [String] {
    guard let opening = pattern.firstIndex(of: "{"),
          let closing = pattern[opening...].firstIndex(of: "}") else {
      return [pattern]
    }

    let alternatives = pattern[pattern.index(after: opening)..<closing].split(separator: ",")
    guard !alternatives.isEmpty else { return [pattern] }

    let prefix = String(pattern[..<opening])
    let suffix = String(pattern[pattern.index(after: closing)...])
    return alternatives.flatMap { expandBraces(prefix + $0 + suffix) }
  }

  private struct ComponentPosition: Hashable {
    let pattern: Int
    let path: Int
  }
}
