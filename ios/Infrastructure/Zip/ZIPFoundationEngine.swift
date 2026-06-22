import Foundation
import ZIPFoundation

final class ZIPFoundationEngine: ArchiveEngine {
  func inspect(input: ArchiveInput) async throws -> ArchiveInspection {
    let data = try await input.openForRandomAccess()
    guard let archive = Archive(data: data, accessMode: .read) else {
      throw ArchiveDomainError.invalidArchive("Could not open ZIP archive")
    }

    var entries: [EntryDescriptor] = []
    var totalCompressed: UInt64 = 0
    var totalUncompressed: UInt64 = 0
    var hasEncrypted = false
    let sortedEntries = archive.sorted(by: { $0.path < $1.path })

    for (index, entry) in sortedEntries.enumerated() {
      let kind: String
      if entry.type == .directory { kind = "directory" }
      else if entry.type == .file { kind = "file" }
      else if entry.type == .symlink { kind = "symlink" }
      else { kind = "unknown" }

      let compMethod = entry.isCompressed ? "deflate" : "store"

      let descriptor = EntryDescriptor(
        index: index,
        path: entry.path,
        kind: kind,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        encrypted: false,
        compressionMethod: compMethod,
        crc32: entry.checksum != 0 ? UInt32(entry.checksum) : nil,
        unixMode: nil
      )
      entries.append(descriptor)
      totalCompressed += entry.compressedSize
      totalUncompressed += entry.uncompressedSize
    }

    return ArchiveInspection(
      format: "zip",
      entryCount: entries.count,
      entries: entries,
      compressedSize: totalCompressed,
      totalUncompressedSize: totalUncompressed,
      encrypted: hasEncrypted,
      comment: nil
    )
  }

  func readEntry(session: ArchiveEngineSession, path: String, limit: UInt64, password: String?) async throws -> Data {
    guard let archiveData = session.archiveData else {
      throw ArchiveDomainError.invalidArchive("No archive data available in session")
    }

    guard let archive = Archive(data: archiveData, accessMode: .read, preferredEncoding: .utf8) else {
      throw ArchiveDomainError.invalidArchive("Could not open ZIP archive for entry reading")
    }

    guard let entry = archive[path] else {
      throw ArchiveDomainError.entryNotFound("Entry not found in archive: \(path)")
    }

    if entry.uncompressedSize > limit {
      throw ArchiveDomainError.bufferLimitExceeded
    }

    var entryData = Data()
    entryData.reserveCapacity(min(Int(entry.uncompressedSize), 16_777_216))

    _ = try archive.extract(entry, consumer: { chunk in
      entryData.append(chunk)
    })

    guard UInt64(entryData.count) <= limit else {
      throw ArchiveDomainError.bufferLimitExceeded
    }

    if password == nil && entry.checksum != 0 {
      let computedCrc = entryData.crc32(checksum: 0)
      guard computedCrc == entry.checksum else {
        throw ArchiveDomainError.checksumMismatch("CRC mismatch for entry: \(path)")
      }
    }

    return entryData
  }

  func createArchive(plan: CreationPlan, output: ArchiveOutput, onProgress: @escaping (ProgressSnapshot) -> Void) async throws -> CreationResult {
    throw ArchiveDomainError.unsupportedFormat("Archive creation not yet implemented in stub")
  }
}
