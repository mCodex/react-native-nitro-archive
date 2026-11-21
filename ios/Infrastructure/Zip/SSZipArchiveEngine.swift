import Foundation
import SSZipArchive

final class SSZipArchiveEngine: ArchiveEngine {

  // MARK: - Inspect

  func inspect(at url: URL) throws -> ArchiveInspection {
    try inspectZip(at: url)
  }

  // MARK: - Read Entry

  func readEntry(session: ArchiveEngineSession, path: String, limit: UInt64, password: String?) async throws -> Data {
    try readZipEntry(at: session.archiveURL, path: path, limit: limit, password: password)
  }

  func extractEntry(session: ArchiveEngineSession, path: String, to destination: URL, limit: UInt64, password: String?) async throws -> UInt64 {
    guard let entry = session.entry(at: path) else {
      throw ArchiveDomainError.entryNotFound(path)
    }

    var writtenBytes: UInt64 = 0
    do {
      try NitroArchiveZipEntryReader.extractEntry(
        atPath: session.archiveURL.path,
        entryIndex: UInt(entry.index),
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

    if plan.encryptionMethod == "aes-128" {
      throw ArchiveDomainError.unsupportedEncryption
    }

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
        processedBytes: totalInputBytes,
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
      processedBytes: totalInputBytes,
      processedEntries: totalEntries, totalEntries: totalEntries,
      currentEntry: nil
    ))

    return CreationResult(entryCount: totalEntries, inputBytes: totalInputBytes, outputBytes: totalOutputBytes)
  }

  // MARK: - Private

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
    case 8:
      return .passwordRequired
    case 9:
      return .badPassword
    default:
      return .invalidArchive(nsError.localizedDescription)
    }
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
