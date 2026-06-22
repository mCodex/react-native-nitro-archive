import Foundation

struct ArchivePath {
  let normalized: String
  let components: [String]
  let depth: Int

  init(raw: String) throws {
    guard !raw.contains("\0") else {
      throw ArchiveDomainError.invalidArgument("Path contains null bytes")
    }

    let replacedBackslash = raw.replacingOccurrences(of: "\\", with: "/")

    guard !replacedBackslash.hasPrefix("/") else {
      throw ArchiveDomainError.absolutePath("Path starts with /: \(raw)")
    }

    guard !replacedBackslash.hasPrefix("//") else {
      throw ArchiveDomainError.pathTraversal("Path is a UNC path: \(raw)")
    }

    for drive in ["A:", "B:", "C:", "D:", "E:", "F:", "G:", "H:", "I:", "J:", "K:", "L:", "M:", "N:", "O:", "P:", "Q:", "R:", "S:", "T:", "U:", "V:", "W:", "X:", "Y:", "Z:"] {
      if replacedBackslash.uppercased().hasPrefix(drive) {
        throw ArchiveDomainError.absolutePath("Path is a Windows drive path: \(raw)")
      }
    }

    guard !replacedBackslash.contains("://") else {
      throw ArchiveDomainError.absolutePath("Path contains URI scheme: \(raw)")
    }

    let rawComponents = replacedBackslash.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    var cleaned: [String] = []

    for component in rawComponents {
      if component == "." { continue }
      if component == ".." {
        throw ArchiveDomainError.pathTraversal("Path contains '..' component: \(raw)")
      }
      guard !component.isEmpty else { continue }
      cleaned.append(component)
    }

    guard !cleaned.isEmpty else {
      throw ArchiveDomainError.invalidArgument("Path is empty after normalization: \(raw)")
    }

    self.components = cleaned
    self.depth = cleaned.count
    self.normalized = cleaned.joined(separator: "/") + (raw.hasSuffix("/") ? "/" : "")
  }

  func resolved(relativeTo base: String) throws -> String {
    var url = URL(fileURLWithPath: base)
    for component in components {
      url.appendPathComponent(component)
    }
    let resolved = url.path
    guard resolved.hasPrefix(base) else {
      throw ArchiveDomainError.pathTraversal("Resolved path escapes base directory")
    }
    return resolved
  }
}
