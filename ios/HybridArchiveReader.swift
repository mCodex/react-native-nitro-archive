import Foundation
import NitroModules

final class HybridArchiveReader: HybridNativeArchiveReaderSpec {
  let format: String
  let entryCount: Double
  let compressedSize: Double?
  let totalUncompressedSize: Double?
  let encrypted: Bool
  let comment: String?

  private let session: ArchiveEngineSession
  private let engine: ArchiveEngine

  init(inspection: ArchiveInspection, session: ArchiveEngineSession, engine: ArchiveEngine) {
    self.format = inspection.format
    self.entryCount = Double(inspection.entryCount)
    self.compressedSize = inspection.compressedSize.map(Double.init)
    self.totalUncompressedSize = inspection.totalUncompressedSize.map(Double.init)
    self.encrypted = inspection.encrypted
    self.comment = inspection.comment
    self.session = session
    self.engine = engine
    super.init()
  }

  func listEntries(offset: Double, limit: Double, prefix: String?, kinds: [String]?) throws -> Promise<NativeEntryPage> {
    Promise.async {
      let allEntries = self.session.entries
      var filtered = allEntries

      if let prefix = prefix, !prefix.isEmpty {
        filtered = filtered.filter { $0.path.hasPrefix(prefix) }
      }
      if let kinds = kinds, !kinds.isEmpty {
        filtered = filtered.filter { kinds.contains($0.kind) }
      }

      let start = Int(offset)
      let max = Int(limit)
      guard start < filtered.count else {
        return NativeEntryPage(entries: [], offset: offset, nextOffset: nil, totalEntries: Double(filtered.count))
      }
      let end = min(start + max, filtered.count)
      let page = Array(filtered[start..<end])
      let nextOffset = end < filtered.count ? Double(end) : nil

      return NativeEntryPage(
        entries: page.map { self.toNativeEntry($0) },
        offset: offset,
        nextOffset: nextOffset,
        totalEntries: Double(filtered.count)
      )
    }
  }

  func getEntry(path: String) throws -> Promise<NativeArchiveEntry?> {
    Promise.async {
      guard let entry = self.session.entry(at: path) else { return nil }
      return self.toNativeEntry(entry)
    }
  }

  func readEntry(path: String, maxBytes: Double, password: String?, verifyChecksum: Bool?) throws -> Promise<ArrayBuffer> {
    Promise.async {
      let data = try await self.engine.readEntry(
        session: self.session,
        path: path,
        limit: try parseNativeByteCount(maxBytes, default: 0),
        password: password
      )

      let buffer = try ArrayBuffer.copy(data: data)
      return buffer
    }
  }

  func startExtraction(request: NativeExtractionRequest) throws -> (any HybridNativeExtractionTaskSpec) {
    HybridExtractionTask(session: session, engine: engine, request: request)
  }

  func startValidation(request: NativeValidationRequest) throws -> (any HybridNativeValidationTaskSpec) {
    HybridValidationTask(session: session, engine: engine, request: request)
  }

  private func toNativeEntry(_ entry: EntryDescriptor) -> NativeArchiveEntry {
    NativeArchiveEntry(
      index: Double(entry.index),
      path: entry.path,
      name: (entry.path as NSString).lastPathComponent,
      parentPath: (entry.path as NSString).deletingLastPathComponent,
      kind: entry.kind,
      compressedSize: Double(entry.compressedSize),
      uncompressedSize: Double(entry.uncompressedSize),
      encrypted: entry.encrypted,
      compressionMethod: entry.compressionMethod,
      modifiedAt: nil,
      crc32: entry.crc32.map(Double.init),
      unixMode: entry.unixMode.map(Double.init)
    )
  }
}
