import Foundation

func inspectZip(at url: URL) throws -> ArchiveInspection {
  let response = url.path.withCString { path in
    nitro_archive_inspect_file_v1(path)
  }

  guard let response else {
    throw ArchiveDomainError.internal("ZIP inspection returned no response")
  }
  defer { nitro_archive_free_json_v1(response) }

  let json = Data(bytesNoCopy: response, count: strlen(response), deallocator: .none)
  let inspection: RustZipInspection
  do {
    inspection = try JSONDecoder().decode(RustZipInspection.self, from: json)
  } catch let error as ArchiveDomainError {
    throw error
  } catch {
    throw ArchiveDomainError.internal("Invalid ZIP inspection response")
  }

  return try inspection.toArchiveInspection()
}

func readZipEntry(at url: URL, path: String, limit: UInt64, password: String?) throws -> Data {
  guard !path.utf8.contains(0) else {
    throw ArchiveDomainError.invalidArgument("Entry path contains a null byte")
  }

  var passwordBytes = password.map { Data($0.utf8) } ?? Data()
  defer { passwordBytes.resetBytes(in: 0..<passwordBytes.count) }

  let result = url.path.withCString { archivePath in
    path.withCString { entryPath in
      passwordBytes.withUnsafeBytes { bytes in
        nitro_archive_read_file_entry_v1(
          archivePath, entryPath, bytes.bindMemory(to: UInt8.self).baseAddress, bytes.count, limit
        )
      }
    }
  }

  if let error = result.error {
    defer { nitro_archive_free_bytes_v1(result) }
    throw rustZipError(String(cString: error), path: path)
  }
  if result.length == 0 {
    nitro_archive_free_bytes_v1(result)
    return Data()
  }
  guard let bytes = result.bytes, let length = Int(exactly: result.length), length > 0 else {
    nitro_archive_free_bytes_v1(result)
    throw ArchiveDomainError.internal("Invalid ZIP entry response")
  }

  return Data(bytesNoCopy: bytes, count: length, deallocator: .custom { _, _ in
    nitro_archive_free_bytes_v1(result)
  })
}

private struct RustZipInspection: Decodable {
  struct Entry: Decodable {
    let path: String
    let kind: String
    let compressedSize: UInt64
    let uncompressedSize: UInt64
    let encrypted: Bool
    let compressionMethod: String
    let crc32: UInt32
    let unixMode: UInt16?
  }

  let entries: [Entry]
  let compressedSize: UInt64
  let totalUncompressedSize: UInt64
  let encrypted: Bool
  let comment: String?

  private enum CodingKeys: String, CodingKey {
    case error, entries, compressedSize, totalUncompressedSize, encrypted, comment
  }

  init(from decoder: Decoder) throws {
    let fields = try decoder.container(keyedBy: CodingKeys.self)
    if let code = try fields.decodeIfPresent(String.self, forKey: .error) {
      throw rustZipError(code)
    }

    entries = try fields.decode([Entry].self, forKey: .entries)
    compressedSize = try fields.decode(UInt64.self, forKey: .compressedSize)
    totalUncompressedSize = try fields.decode(UInt64.self, forKey: .totalUncompressedSize)
    encrypted = try fields.decode(Bool.self, forKey: .encrypted)
    comment = try fields.decodeIfPresent(String.self, forKey: .comment)
  }

  func toArchiveInspection() throws -> ArchiveInspection {
    try checkNativeByteCounts(compressedSize, totalUncompressedSize)

    let descriptors = try entries.enumerated().map { index, entry in
      try checkNativeByteCounts(entry.compressedSize, entry.uncompressedSize)

      return EntryDescriptor(
        index: index, path: entry.path, kind: entry.kind,
        compressedSize: entry.compressedSize, uncompressedSize: entry.uncompressedSize,
        encrypted: entry.encrypted, compressionMethod: entry.compressionMethod,
        crc32: entry.crc32, unixMode: entry.unixMode
      )
    }

    return ArchiveInspection(
      format: "zip", entryCount: descriptors.count, entries: descriptors,
      compressedSize: compressedSize, totalUncompressedSize: totalUncompressedSize,
      encrypted: encrypted, comment: comment
    )
  }

  private func checkNativeByteCounts(_ compressedSize: UInt64, _ uncompressedSize: UInt64) throws {
    let maxSafeInteger: UInt64 = 9_007_199_254_740_991
    guard compressedSize <= maxSafeInteger, uncompressedSize <= maxSafeInteger else {
      throw ArchiveDomainError.archiveTooLarge
    }
  }
}

private func rustZipError(_ code: String, path: String = "") -> ArchiveDomainError {
  switch code {
  case "E_INVALID_ARGUMENT": return .invalidArgument("Invalid ZIP input")
  case "E_INVALID_ARCHIVE": return .invalidArchive("Invalid ZIP archive")
  case "E_TRUNCATED_ARCHIVE": return .truncatedArchive
  case "E_ARCHIVE_TOO_LARGE": return .archiveTooLarge
  case "E_ABSOLUTE_PATH": return .absolutePath("ZIP entry has an absolute path")
  case "E_PATH_TRAVERSAL": return .pathTraversal("ZIP entry escapes its parent directory")
  case "E_DUPLICATE_ENTRY": return .duplicateEntry("ZIP entries share a normalized path")
  case "E_UNSUPPORTED_FORMAT": return .unsupportedFormat("Unsupported archive format")
  case "E_UNSUPPORTED_COMPRESSION": return .unsupportedCompression("Unsupported ZIP compression")
  case "E_BUFFER_LIMIT_EXCEEDED": return .bufferLimitExceeded
  case "E_PASSWORD_REQUIRED": return .passwordRequired
  case "E_BAD_PASSWORD": return .badPassword
  case "E_ENTRY_NOT_FOUND": return .entryNotFound(path)
  case "E_CHECKSUM_MISMATCH": return .checksumMismatch(path)
  case "E_IO": return .ioError("Could not access ZIP archive")
  default: return .internal("ZIP operation failed")
  }
}
