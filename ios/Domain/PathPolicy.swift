import Foundation

enum SymlinkPolicy {
  case reject, materialize, preserveSafe
}

enum OverwritePolicy {
  case error, skip, replace, rename
}

enum DuplicateEntryPolicy {
  case error, first, last
}
