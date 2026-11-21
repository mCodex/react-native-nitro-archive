import Foundation

protocol ArchiveEngine: AnyObject {
  func inspect(at url: URL) throws -> ArchiveInspection
  func readEntry(session: ArchiveEngineSession, path: String, limit: UInt64, password: String?) async throws -> Data
  func extractEntry(session: ArchiveEngineSession, path: String, outputFd: Int32, limit: UInt64, password: String?, onProgress: @escaping ArchiveOperationProgress) throws -> UInt64
  func createArchive(plan: CreationPlan, outputFd: Int32, onProgress: @escaping ArchiveOperationProgress) throws -> CreationResult
}

typealias ArchiveOperationProgress = (UInt64, UInt64) -> Bool

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
  let format: String
  let entries: [EntryInput]
  let compressionProfile: String?
  let compressionLevel: Int?
  let storeAlreadyCompressed: Bool
  let encryptionMethod: String?
  let encryptionPassword: String?
  let includeEmptyDirectories: Bool
  let preserveTimestamps: Bool
}

struct EntryInput {
  let kind: String
  let sourcePath: String?
  let sourceUri: String?
  let iosSecurityScope: String?
  let archivePath: String
  let data: Data?
  let recursive: Bool?
  let includeHidden: Bool?
  let followSymlinks: Bool?
  let include: [String]?
  let exclude: [String]?
  let compressionMethod: String?
  let modifiedAt: TimeInterval?
}

struct CreationResult: Decodable {
  let entryCount: Int
  let inputBytes: UInt64
  let outputBytes: UInt64
}
