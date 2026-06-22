import Foundation

protocol ArchiveEngine: AnyObject {
  func inspect(input: ArchiveInput) async throws -> ArchiveInspection
  func readEntry(session: ArchiveEngineSession, path: String, limit: UInt64, password: String?) async throws -> Data
  func createArchive(plan: CreationPlan, output: ArchiveOutput, onProgress: @escaping (ProgressSnapshot) -> Void) async throws -> CreationResult
}

struct ArchiveInspection {
  let format: String
  let entryCount: Int
  let entries: [EntryDescriptor]
  let compressedSize: UInt64?
  let totalUncompressedSize: UInt64?
  let encrypted: Bool
  let comment: String?
}

struct EntryDescriptor {
  let index: Int
  let path: String
  let kind: String
  let compressedSize: UInt64
  let uncompressedSize: UInt64
  let encrypted: Bool
  let compressionMethod: String
  let crc32: UInt32?
  let unixMode: UInt16?
}

struct CreationPlan {
  let entries: [EntryInput]
  let compressionProfile: String?
  let compressionLevel: Int?
  let storeAlreadyCompressed: Bool
}

struct EntryInput {
  let kind: String
  let sourcePath: String?
  let archivePath: String
  let data: Data?
}

struct CreationResult {
  let entryCount: Int
  let inputBytes: UInt64
  let outputBytes: UInt64
}
