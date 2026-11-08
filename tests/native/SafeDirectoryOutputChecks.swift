import Foundation

@main
enum SafeDirectoryOutputChecks {
  static func expectFailure(_ action: () async throws -> Void) async throws {
    do {
      try await action()
    } catch {
      return
    }

    throw NSError(domain: "SafeDirectoryOutputChecks", code: 1,
                  userInfo: [NSLocalizedDescriptionKey: "Expected the unsafe write to fail"])
  }

  static func main() async throws {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.resolvingSymlinksInPath()
      .appendingPathComponent("nitro-output-checks-\(UUID().uuidString)")
    try manager.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? manager.removeItem(at: root) }

    let existingFile = root.appendingPathComponent("existing.txt")
    try Data("keep".utf8).write(to: existingFile)
    let output = SafeDirectoryOutput(baseURL: root)
    try await expectFailure { _ = try await output.createFile(at: "existing.txt") }
    let preservedContents = try Data(contentsOf: existingFile)
    precondition(preservedContents == Data("keep".utf8))

    let existingDirectory = root.appendingPathComponent("existing")
    try manager.createDirectory(at: existingDirectory, withIntermediateDirectories: false)
    try Data("keep".utf8).write(to: existingDirectory.appendingPathComponent("keep.txt"))
    try await output.prepareDirectory(at: "existing")
    _ = try await output.createFile(at: "existing/new.txt")
    _ = try await output.createFile(at: "new/nested/file.txt")
    try await output.rollback()
    precondition(manager.fileExists(atPath: existingDirectory.appendingPathComponent("keep.txt").path))
    precondition(!manager.fileExists(atPath: root.appendingPathComponent("new").path))

    let outside = root.appendingPathComponent("outside")
    try manager.createDirectory(at: outside, withIntermediateDirectories: false)
    try manager.createSymbolicLink(at: root.appendingPathComponent("link"), withDestinationURL: outside)
    try await expectFailure { _ = try await output.createFile(at: "link/escaped.txt") }
    try await expectFailure { try await output.prepareDirectory(at: "link") }
    let linkedRoot = SafeDirectoryOutput(baseURL: root.appendingPathComponent("link"))
    try await expectFailure { _ = try await linkedRoot.createFile(at: "escaped.txt") }
    precondition(!manager.fileExists(atPath: outside.appendingPathComponent("escaped.txt").path))

    for path in ["../escaped.txt", "/absolute.txt", "", ".", "a/../escaped.txt", "a\\b"] {
      try await expectFailure { _ = try await output.createFile(at: path) }
    }

    let conservative = SafeDirectoryOutput(baseURL: root)
    try await conservative.prepareDirectory(at: "shared")
    let foreignFile = root.appendingPathComponent("shared/foreign.txt")
    try Data("keep".utf8).write(to: foreignFile)
    try await expectFailure { try await conservative.rollback() }
    precondition(manager.fileExists(atPath: foreignFile.path))

    let committed = SafeDirectoryOutput(baseURL: root)
    _ = try await committed.createFile(at: "committed.txt")
    try await committed.commit()
    try await committed.rollback()
    precondition(manager.fileExists(atPath: root.appendingPathComponent("committed.txt").path))

    print("SafeDirectoryOutput: overwrite, rollback, symlink, traversal and commit checks passed")
  }
}
