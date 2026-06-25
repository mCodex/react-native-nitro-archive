import Foundation
import SSZipArchive

final class SSZipArchiveEngine: ArchiveEngine {

  // MARK: - Inspect

  func inspect(input: ArchiveInput) async throws -> ArchiveInspection {
    let data = try await input.openForRandomAccess()
    return try inspect(data: data)
  }

  func inspect(data: Data) throws -> ArchiveInspection {
    try inspectCentralDirectory(data)
  }

  // MARK: - Read Entry

  func readEntry(session: ArchiveEngineSession, path: String, limit: UInt64, password: String?) async throws -> Data {
    guard let archiveURL = try archiveURL(for: session) else {
      throw ArchiveDomainError.invalidArchive("No archive data available in session")
    }

    do {
      return try NitroArchiveZipEntryReader.readEntry(
        atPath: archiveURL.path,
        entryPath: path,
        password: password,
        limit: limit
      )
    } catch {
      throw mapEntryReaderError(error, path: path)
    }
  }

  func extractEntry(session: ArchiveEngineSession, path: String, to destination: URL, limit: UInt64, password: String?) async throws -> UInt64 {
    guard let archiveURL = try archiveURL(for: session) else {
      throw ArchiveDomainError.invalidArchive("No archive data available in session")
    }

    var writtenBytes: UInt64 = 0
    do {
      try NitroArchiveZipEntryReader.extractEntry(
        atPath: archiveURL.path,
        entryPath: path,
        destinationPath: destination.path,
        password: password,
        limit: limit,
        writtenBytes: &writtenBytes
      )
      return writtenBytes
    } catch {
      throw mapEntryReaderError(error, path: path)
    }
  }

  // MARK: - Create Archive

  func createArchive(plan: CreationPlan, output: ArchiveOutput, onProgress: @escaping (ProgressSnapshot) -> Void) async throws -> CreationResult {
    let tempDir = makeTempDir(suffix: "create")
    let zipPath = tempDir.appendingPathComponent(UUID().uuidString).appendingPathExtension("zip").path
    defer { try? FileManager.default.removeItem(at: tempDir) }

    var totalInputBytes: UInt64 = 0
    let totalEntries = plan.entries.count

    let compressionLevel: Int32
    if let level = plan.compressionLevel {
      compressionLevel = Int32(max(0, min(9, level)))
    } else if let profile = plan.compressionProfile {
      switch profile {
      case "fastest": compressionLevel = 1
      case "smallest": compressionLevel = 9
      default: compressionLevel = 6
      }
    } else {
      compressionLevel = 6
    }

    let useAES = plan.encryptionMethod == "aes-128" || plan.encryptionMethod == "aes-256"
    let useEncryption = plan.encryptionMethod != nil && plan.encryptionMethod != "none"
    let password = plan.encryptionPassword
    let shouldStore = plan.storeAlreadyCompressed

    if useEncryption && password == nil {
      throw ArchiveDomainError.passwordRequired
    }

    let zipArchive = SSZipArchive(path: zipPath)
    guard zipArchive.open() else {
      throw ArchiveDomainError.invalidArchive("Could not open archive for writing")
    }
    var closed = false
    defer {
      if !closed {
        zipArchive.close()
      }
    }

    for (index, entry) in plan.entries.enumerated() {
      onProgress(ProgressSnapshot(
        operationId: "", phase: "compressing",
        processedBytes: totalInputBytes, totalBytes: nil,
        processedEntries: index, totalEntries: totalEntries,
        currentEntry: entry.archivePath
      ))

      let entryCompLevel: Int32
      let archivePath = try ArchivePath(raw: entry.archivePath).normalized
      let entryShouldStore = shouldStore && isAlreadyCompressed(archivePath)
      if entryShouldStore {
        entryCompLevel = -1
      } else if let method = entry.compressionMethod, method == "store" {
        entryCompLevel = -1
      } else {
        entryCompLevel = compressionLevel
      }

      let useEntryAES = useAES && useEncryption
      let useEntryPassword = useEncryption ? password : nil

      switch entry.kind {
      case "file":
        guard let sourcePath = entry.sourcePath else {
          throw ArchiveDomainError.invalidArgument("File entry requires sourcePath")
        }
        guard FileManager.default.fileExists(atPath: sourcePath) else {
          throw ArchiveDomainError.fileNotAvailable(sourcePath)
        }
        let fileSize = (try? FileManager.default.attributesOfItem(atPath: sourcePath)[.size] as? UInt64) ?? 0
        totalInputBytes += fileSize

        let success = zipArchive.writeFile(
          atPath: sourcePath,
          withFileName: archivePath,
          compressionLevel: entryCompLevel,
          password: useEntryPassword,
          aes: useEntryAES
        )
        guard success else {
          throw ArchiveDomainError.ioError("Failed to add file entry: \(entry.archivePath)")
        }

      case "buffer":
        guard let data = entry.data else {
          throw ArchiveDomainError.invalidArgument("Buffer entry requires data")
        }
        totalInputBytes += UInt64(data.count)

        let success = zipArchive.write(
          data,
          filename: archivePath,
          compressionLevel: entryCompLevel,
          password: useEntryPassword,
          aes: useEntryAES
        )
        guard success else {
          throw ArchiveDomainError.ioError("Failed to add buffer entry: \(entry.archivePath)")
        }

      case "directory":
        guard let sourcePath = entry.sourcePath else {
          throw ArchiveDomainError.invalidArgument("Directory entry requires sourcePath")
        }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: sourcePath, isDirectory: &isDirectory), isDirectory.boolValue else {
          throw ArchiveDomainError.fileNotAvailable(sourcePath)
        }
        let dirPath = archivePath.hasSuffix("/") ? archivePath : archivePath + "/"
        let success = zipArchive.writeFolder(
          atPath: sourcePath,
          withFolderName: dirPath,
          withPassword: useEntryPassword
        )
        guard success else {
          throw ArchiveDomainError.ioError("Failed to add directory entry: \(entry.archivePath)")
        }

      default:
        throw ArchiveDomainError.invalidArgument("Unsupported entry kind: \(entry.kind)")
      }
    }

    zipArchive.close()
    closed = true

    let archiveData = try Data(contentsOf: URL(fileURLWithPath: zipPath))
    let totalOutputBytes = UInt64(archiveData.count)

    try await output.write(archiveData)
    try await output.finalize()

    onProgress(ProgressSnapshot(
      operationId: "", phase: "finalizing",
      processedBytes: totalInputBytes, totalBytes: nil,
      processedEntries: totalEntries, totalEntries: totalEntries,
      currentEntry: nil
    ))

    return CreationResult(entryCount: totalEntries, inputBytes: totalInputBytes, outputBytes: totalOutputBytes)
  }

  // MARK: - Private

  private func archiveURL(for session: ArchiveEngineSession) throws -> URL? {
    if let archiveURL = session.archiveURL {
      return archiveURL
    }
    guard let archiveData = session.archiveData else {
      return nil
    }
    let tempDir = makeTempDir(suffix: "entry")
    let archiveURL = tempDir.appendingPathComponent("archive.zip")
    try archiveData.write(to: archiveURL)
    return archiveURL
  }

  private func mapEntryReaderError(_ error: Error, path: String) -> ArchiveDomainError {
    let nsError = error as NSError
    guard nsError.domain == NitroArchiveZipEntryReaderErrorDomain else {
      return .ioError(error.localizedDescription)
    }
    switch nsError.code {
    case 2:
      return .entryNotFound("Entry not found in archive: \(path)")
    case 4:
      return .bufferLimitExceeded
    case 7:
      return .checksumMismatch(path)
    default:
      return .invalidArchive(nsError.localizedDescription)
    }
  }

  private let maxCentralDirectoryBytes = 268_435_456

  private func inspectCentralDirectory(_ data: Data) throws -> ArchiveInspection {
    guard data.count >= 22 else {
      throw ArchiveDomainError.truncatedArchive
    }
    guard let eocdOffset = findEndOfCentralDirectory(in: data) else {
      throw ArchiveDomainError.invalidArchive("Could not find ZIP central directory")
    }

    var entryCount = Int(readUInt16(data, eocdOffset + 10))
    var centralDirectorySize = UInt64(readUInt32(data, eocdOffset + 12))
    var centralDirectoryOffset = UInt64(readUInt32(data, eocdOffset + 16))

    if entryCount == 0xffff || centralDirectorySize == 0xffff_ffff || centralDirectoryOffset == 0xffff_ffff {
      let zip64 = try readZip64EndOfCentralDirectory(data, eocdOffset: eocdOffset)
      entryCount = zip64.entryCount
      centralDirectorySize = zip64.centralDirectorySize
      centralDirectoryOffset = zip64.centralDirectoryOffset
    }

    guard centralDirectorySize <= UInt64(maxCentralDirectoryBytes) else {
      throw ArchiveDomainError.archiveTooLarge
    }
    guard centralDirectoryOffset <= UInt64(data.count),
          centralDirectorySize <= UInt64(data.count),
          centralDirectoryOffset + centralDirectorySize <= UInt64(data.count) else {
      throw ArchiveDomainError.truncatedArchive
    }

    var offset = Int(centralDirectoryOffset)
    var entries: [EntryDescriptor] = []
    entries.reserveCapacity(min(entryCount, 4096))
    var totalCompressed: UInt64 = 0
    var totalUncompressed: UInt64 = 0
    var encrypted = false

    for index in 0..<entryCount {
      guard offset + 46 <= data.count, readUInt32(data, offset) == 0x02014b50 else {
        throw ArchiveDomainError.invalidArchive("Invalid ZIP central directory entry")
      }

      let versionMadeBy = readUInt16(data, offset + 4)
      let flags = readUInt16(data, offset + 8)
      let method = readUInt16(data, offset + 10)
      let crc = readUInt32(data, offset + 16)
      var compressedSize = UInt64(readUInt32(data, offset + 20))
      var uncompressedSize = UInt64(readUInt32(data, offset + 24))
      let nameLength = Int(readUInt16(data, offset + 28))
      let extraLength = Int(readUInt16(data, offset + 30))
      let commentLength = Int(readUInt16(data, offset + 32))
      let externalAttributes = readUInt32(data, offset + 38)
      let nameOffset = offset + 46
      let extraOffset = nameOffset + nameLength
      let nextOffset = extraOffset + extraLength + commentLength

      guard nameLength > 0, nextOffset <= data.count else {
        throw ArchiveDomainError.truncatedArchive
      }

      if compressedSize == 0xffff_ffff || uncompressedSize == 0xffff_ffff {
        let sizes = try readZip64Extra(data, offset: extraOffset, length: extraLength, needsUncompressed: uncompressedSize == 0xffff_ffff, needsCompressed: compressedSize == 0xffff_ffff)
        if let value = sizes.uncompressedSize { uncompressedSize = value }
        if let value = sizes.compressedSize { compressedSize = value }
      }

      let nameData = data[nameOffset..<extraOffset]
      guard let rawPath = String(data: nameData, encoding: (flags & 0x0800) != 0 ? .utf8 : .isoLatin1) else {
        throw ArchiveDomainError.invalidArchive("Invalid ZIP entry name encoding")
      }
      let path = try ArchivePath(raw: rawPath).normalized
      let unixMode = UInt16((externalAttributes >> 16) & 0xffff)
      let kind = entryKind(path: path, versionMadeBy: versionMadeBy, unixMode: unixMode)

      entries.append(EntryDescriptor(
        index: index,
        path: path,
        kind: kind,
        compressedSize: compressedSize,
        uncompressedSize: uncompressedSize,
        encrypted: (flags & 0x0001) != 0,
        compressionMethod: compressionMethod(method),
        crc32: crc != 0 ? crc : nil,
        unixMode: unixMode == 0 ? nil : unixMode
      ))

      encrypted = encrypted || (flags & 0x0001) != 0
      totalCompressed += compressedSize
      totalUncompressed += uncompressedSize
      offset = nextOffset
    }

    return ArchiveInspection(
      format: "zip",
      entryCount: entries.count,
      entries: entries,
      compressedSize: totalCompressed,
      totalUncompressedSize: totalUncompressed,
      encrypted: encrypted,
      comment: nil
    )
  }

  private func findEndOfCentralDirectory(in data: Data) -> Int? {
    let minOffset = max(0, data.count - 65_557)
    guard data.count >= 4 else { return nil }
    for offset in stride(from: data.count - 4, through: minOffset, by: -1) {
      if readUInt32(data, offset) == 0x06054b50 {
        return offset
      }
    }
    return nil
  }

  private func readZip64EndOfCentralDirectory(_ data: Data, eocdOffset: Int) throws -> (entryCount: Int, centralDirectorySize: UInt64, centralDirectoryOffset: UInt64) {
    let locatorOffset = eocdOffset - 20
    guard locatorOffset >= 0, readUInt32(data, locatorOffset) == 0x07064b50 else {
      throw ArchiveDomainError.invalidArchive("Missing ZIP64 central directory locator")
    }
    let zip64Offset64 = readUInt64(data, locatorOffset + 8)
    guard zip64Offset64 <= UInt64(Int.max) else {
      throw ArchiveDomainError.archiveTooLarge
    }
    let zip64Offset = Int(zip64Offset64)
    guard zip64Offset + 56 <= data.count, readUInt32(data, zip64Offset) == 0x06064b50 else {
      throw ArchiveDomainError.invalidArchive("Missing ZIP64 central directory")
    }
    let entries = readUInt64(data, zip64Offset + 32)
    guard entries <= UInt64(Int.max) else {
      throw ArchiveDomainError.archiveTooLarge
    }
    return (
      Int(entries),
      readUInt64(data, zip64Offset + 40),
      readUInt64(data, zip64Offset + 48)
    )
  }

  private func readZip64Extra(_ data: Data, offset: Int, length: Int, needsUncompressed: Bool, needsCompressed: Bool) throws -> (uncompressedSize: UInt64?, compressedSize: UInt64?) {
    var cursor = offset
    let end = offset + length
    while cursor + 4 <= end {
      let headerId = readUInt16(data, cursor)
      let dataSize = Int(readUInt16(data, cursor + 2))
      cursor += 4
      guard cursor + dataSize <= end else {
        throw ArchiveDomainError.truncatedArchive
      }
      if headerId == 0x0001 {
        var valueOffset = cursor
        var uncompressed: UInt64?
        var compressed: UInt64?
        if needsUncompressed {
          guard valueOffset + 8 <= cursor + dataSize else { throw ArchiveDomainError.truncatedArchive }
          uncompressed = readUInt64(data, valueOffset)
          valueOffset += 8
        }
        if needsCompressed {
          guard valueOffset + 8 <= cursor + dataSize else { throw ArchiveDomainError.truncatedArchive }
          compressed = readUInt64(data, valueOffset)
        }
        return (uncompressed, compressed)
      }
      cursor += dataSize
    }
    throw ArchiveDomainError.truncatedArchive
  }

  private func entryKind(path: String, versionMadeBy: UInt16, unixMode: UInt16) -> String {
    if path.hasSuffix("/") { return "directory" }
    guard (versionMadeBy >> 8) == 3 else { return "file" }
    switch unixMode & 0xf000 {
    case 0xa000: return "symlink"
    case 0x8000: return "file"
    case 0x4000: return "directory"
    case 0: return "file"
    default: return "special"
    }
  }

  private func compressionMethod(_ method: UInt16) -> String {
    switch method {
    case 0: return "store"
    case 8: return "deflate"
    case 12: return "bzip2"
    case 14: return "lzma"
    case 93: return "zstd"
    default: return "unknown"
    }
  }

  private func readUInt16(_ data: Data, _ offset: Int) -> UInt16 {
    UInt16(data[offset]) | UInt16(data[offset + 1]) << 8
  }

  private func readUInt32(_ data: Data, _ offset: Int) -> UInt32 {
    UInt32(readUInt16(data, offset)) | UInt32(readUInt16(data, offset + 2)) << 16
  }

  private func readUInt64(_ data: Data, _ offset: Int) -> UInt64 {
    UInt64(readUInt32(data, offset)) | UInt64(readUInt32(data, offset + 4)) << 32
  }

  private func isAlreadyCompressed(_ path: String) -> Bool {
    let ext = (path as NSString).pathExtension.lowercased()
    let compressedExtensions: Set<String> = [
      "jpg", "jpeg", "png", "webp", "avif", "heic",
      "mp4", "mov", "m4v", "mp3", "aac", "m4a", "ogg",
      "zip", "gz", "zst"
    ]
    return compressedExtensions.contains(ext)
  }

  private func makeTempDir(suffix: String) -> URL {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathComponent(suffix)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }
}
