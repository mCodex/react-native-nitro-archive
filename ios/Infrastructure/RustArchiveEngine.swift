import Foundation

final class RustArchiveEngine: ArchiveEngine {
  func inspect(at url: URL) throws -> ArchiveInspection {
    try inspectArchive(at: url)
  }

  func readEntry(session: ArchiveEngineSession, path: String, limit: UInt64, password: String?) async throws -> Data {
    try readArchiveEntry(at: session.archiveURL, path: path, limit: limit, password: password)
  }

  func extractEntry(
    session: ArchiveEngineSession, path: String, outputFd: Int32, limit: UInt64,
    password: String?, onProgress: @escaping ArchiveOperationProgress
  ) throws -> UInt64 {
    let request = ExtractRequest(
      archivePath: session.archiveURL.path, entryPath: path, outputFd: outputFd, limit: limit
    )
    let result: ExtractResponse = try runArchiveOperation(request, password: password, onProgress: onProgress)
    return result.writtenBytes
  }

  func createArchive(
    plan: CreationPlan, outputFd: Int32, onProgress: @escaping ArchiveOperationProgress
  ) throws -> CreationResult {
    let workspace = try ArchiveWorkspace()
    let entries = try creationEntries(plan, workspace: workspace, onProgress: onProgress)
    let request = CreateRequest(
      format: plan.format, outputFd: outputFd, entries: entries,
      compressionLevel: plan.compressionLevel ?? compressionLevel(plan.compressionProfile),
      storeAlreadyCompressed: plan.storeAlreadyCompressed, encryptionMethod: plan.encryptionMethod
    )

    return try withExtendedLifetime(workspace) {
      try runArchiveOperation(request, password: plan.encryptionPassword, onProgress: onProgress)
    }
  }

  private func creationEntries(
    _ plan: CreationPlan, workspace: ArchiveWorkspace, onProgress: ArchiveOperationProgress
  ) throws -> [CreateEntry] {
    var result: [CreateEntry] = []
    for input in plan.entries {
      guard onProgress(0, 0) else { throw ArchiveDomainError.operationCancelled }

      let archivePath = try ArchivePath(raw: input.archivePath).normalized
      switch input.kind {
      case "buffer":
        guard let data = input.data else { throw ArchiveDomainError.invalidArgument("Missing entry buffer") }
        let stage = workspace.directory.appendingPathComponent(UUID().uuidString)
        try data.write(to: stage)
        result.append(CreateEntry(
          path: archivePath, kind: "file", sourcePath: stage.path,
          compressionMethod: input.compressionMethod,
          modifiedAt: plan.preserveTimestamps ? input.modifiedAt : 0
        ))
      case "uri":
        guard let uri = input.sourceUri, let url = URL(string: uri), url.isFileURL else {
          throw ArchiveDomainError.providerUnsupported
        }
        let stage = workspace.directory.appendingPathComponent(UUID().uuidString)
        try LocalFileInput(uri: url, securityScope: input.iosSecurityScope).stage(at: stage)
        result.append(try fileEntry(archivePath, from: stage, input: input, preserveTimestamps: plan.preserveTimestamps))
      case "file":
        guard let path = input.sourcePath else { throw ArchiveDomainError.invalidArgument("Missing source path") }
        result.append(try fileEntry(
          archivePath, from: URL(fileURLWithPath: path), input: input,
          preserveTimestamps: plan.preserveTimestamps
        ))
      case "directory":
        guard let path = input.sourcePath else {
          throw ArchiveDomainError.invalidArgument("Missing source directory")
        }
        try appendDirectory(
          URL(fileURLWithPath: path), path: archivePath, relativePath: "", input: input, plan: plan,
          ancestors: [], result: &result, onProgress: onProgress
        )
      default:
        throw ArchiveDomainError.invalidArgument("Unsupported creation input")
      }
      guard result.count <= 10_000 else { throw ArchiveDomainError.archiveTooLarge }
    }
    return result
  }

  private func appendDirectory(
    _ url: URL, path: String, relativePath: String, input: EntryInput, plan: CreationPlan, ancestors: Set<URL>,
    result: inout [CreateEntry], onProgress: ArchiveOperationProgress
  ) throws {
    guard onProgress(0, 0) else { throw ArchiveDomainError.operationCancelled }
    guard try ArchivePath(raw: path).depth <= 32 else { throw ArchiveDomainError.archiveTooLarge }

    let resolved = url.resolvingSymlinksInPath()
    let sourceProperties = try url.resourceValues(forKeys: [.isSymbolicLinkKey])
    guard sourceProperties.isSymbolicLink != true || input.followSymlinks == true else {
      throw ArchiveDomainError.unsafeSymlink(path)
    }
    guard !ancestors.contains(resolved) else { throw ArchiveDomainError.unsafeSymlink(path) }

    let properties = try resolved.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey])
    guard properties.isDirectory == true else {
      throw ArchiveDomainError.fileNotAvailable("Creation input is not a directory")
    }

    let prefix = path.hasSuffix("/") ? path : path + "/"
    let children = try FileManager.default.contentsOfDirectory(
      at: resolved, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
      options: input.includeHidden == true ? [] : [.skipsHiddenFiles]
    ).sorted { $0.lastPathComponent < $1.lastPathComponent }
    guard children.count <= 10_000 else { throw ArchiveDomainError.archiveTooLarge }

    let position = result.count
    let includeDirectory = plan.includeEmptyDirectories && (
      relativePath.isEmpty ? input.include == nil : matches(relativePath, patterns: input.include, default: true)
    )
    if includeDirectory {
      result.append(CreateEntry(
        path: prefix, kind: "directory", sourcePath: nil, compressionMethod: nil,
        modifiedAt: plan.preserveTimestamps ? milliseconds(properties.contentModificationDate) : 0
      ))
    }

    for child in children {
      guard onProgress(0, 0) else { throw ArchiveDomainError.operationCancelled }
      let childRelativePath = relativePath.isEmpty ? child.lastPathComponent : relativePath + "/" + child.lastPathComponent
      guard !matches(childRelativePath, patterns: input.exclude, default: false) else { continue }
      let properties = try child.resourceValues(forKeys: [.isSymbolicLinkKey])
      if properties.isSymbolicLink == true, input.followSymlinks != true { continue }
      let effective = properties.isSymbolicLink == true ? child.resolvingSymlinksInPath() : child
      let childProperties = try effective.resourceValues(forKeys: [.isDirectoryKey])
      let childPath = try ArchivePath(raw: prefix + child.lastPathComponent).normalized

      if childProperties.isDirectory == true {
        if input.recursive ?? true {
          try appendDirectory(
            effective, path: childPath, relativePath: childRelativePath, input: input, plan: plan,
            ancestors: ancestors.union([resolved]), result: &result, onProgress: onProgress
          )
        }
      } else if matches(childRelativePath, patterns: input.include, default: true) {
        result.append(try fileEntry(childPath, from: effective, input: input, preserveTimestamps: plan.preserveTimestamps))
      }
      guard result.count <= 10_000 else { throw ArchiveDomainError.archiveTooLarge }
    }

    if !includeDirectory, result.count > position {
      result.insert(CreateEntry(
        path: prefix, kind: "directory", sourcePath: nil, compressionMethod: nil,
        modifiedAt: plan.preserveTimestamps ? milliseconds(properties.contentModificationDate) : 0
      ), at: position)
    }
  }

  private func fileEntry(
    _ archivePath: String, from url: URL, input: EntryInput, preserveTimestamps: Bool
  ) throws -> CreateEntry {
    let properties = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .contentModificationDateKey])
    guard properties.isSymbolicLink != true else { throw ArchiveDomainError.unsafeSymlink(archivePath) }
    guard properties.isRegularFile == true else { throw ArchiveDomainError.specialFile(archivePath) }

    return CreateEntry(
      path: archivePath, kind: "file", sourcePath: url.path,
      compressionMethod: input.compressionMethod,
      modifiedAt: preserveTimestamps ? milliseconds(properties.contentModificationDate) : 0
    )
  }

  private func matches(_ path: String, patterns: [String]?, default defaultValue: Bool) -> Bool {
    patterns?.contains { ArchiveGlob.matches(pattern: $0, path: path) } ?? defaultValue
  }

  private func milliseconds(_ date: Date?) -> Double? {
    date.map { ($0.timeIntervalSince1970 * 1000).rounded(.towardZero) }
  }

  private func compressionLevel(_ profile: String?) -> Int {
    switch profile {
    case "fastest": return 1
    case "smallest": return 9
    default: return 6
    }
  }
}

private struct CreateEntry: Encodable {
  let path: String
  let kind: String
  let sourcePath: String?
  let compressionMethod: String?
  let modifiedAt: Double?
}

private struct CreateRequest: Encodable {
  let operation = "create"
  let format: String
  let outputFd: Int32
  let entries: [CreateEntry]
  let compressionLevel: Int
  let storeAlreadyCompressed: Bool
  let encryptionMethod: String?
}

private struct ExtractRequest: Encodable {
  let operation = "extract"
  let archivePath: String
  let entryPath: String
  let outputFd: Int32
  let limit: UInt64
}

private struct ExtractResponse: Decodable {
  let writtenBytes: UInt64
}
