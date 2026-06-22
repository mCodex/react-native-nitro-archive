import Foundation

struct DuplicatePathPolicy {
  private var seenPaths: Set<String> = []
  private let policy: DuplicateEntryPolicy

  init(policy: DuplicateEntryPolicy = .error) {
    self.policy = policy
  }

  mutating func check(_ path: String) throws -> Bool {
    if seenPaths.contains(path) {
      switch policy {
      case .error:
        throw ArchiveDomainError.duplicateEntry("Duplicate output path: \(path)")
      case .first:
        return false
      case .last:
        return true
      }
    }
    seenPaths.insert(path)
    return true
  }
}
