import Foundation

private final class InspectionEngine: ArchiveEngine {
  var stagedURL: URL?

  func inspect(at url: URL) throws -> ArchiveInspection {
    stagedURL = url
    return try inspectZip(at: url)
  }

  func readEntry(session: ArchiveEngineSession, path: String, limit: UInt64, password: String?) async throws -> Data {
    try readZipEntry(at: session.archiveURL, path: path, limit: limit, password: password)
  }

  func extractEntry(session: ArchiveEngineSession, path: String, to destination: URL, limit: UInt64, password: String?) async throws -> UInt64 {
    throw ArchiveDomainError.internal("Unexpected extraction")
  }

  func createArchive(plan: CreationPlan, output: ArchiveOutput, onProgress: @escaping (ProgressSnapshot) -> Void) async throws -> CreationResult {
    throw ArchiveDomainError.internal("Unexpected archive creation")
  }
}

@main
enum RustZipInspectionChecks {
  static func main() async throws {
    let fixtures = URL(fileURLWithPath: "rust/tests/fixtures", isDirectory: true)
    let interop = fixtures.appendingPathComponent("interop.zip")
    let archive = try inspectZip(at: interop)
    precondition(archive.entries.map(\.path) == ["stored.txt", "files/", "files/café.txt"])
    precondition(archive.entries.map(\.index) == [0, 1, 2])
    precondition(archive.totalUncompressedSize == 1036)
    precondition(archive.comment == "independent ZIP fixture")

    let engine = InspectionEngine()
    let useCase = OpenArchiveUseCase(engine: engine)
    let zip64 = fixtures.appendingPathComponent("zip64.zip")
    let fileManager = FileManager.default

    do {
      let opened = try await useCase.execute(input: LocalFileInput(path: zip64.path))
      let staged = opened.session.archiveURL
      let entry = opened.session.entry(at: "zip64.txt")
      let payload = try await engine.readEntry(
        session: opened.session, path: "zip64.txt", limit: 14, password: nil
      )

      precondition(staged != zip64 && fileManager.fileExists(atPath: staged.path))
      precondition(entry?.index == 0 && entry?.uncompressedSize == 14)
      precondition(payload == Data("ZIP64 payload\n".utf8))
    }
    guard let previousStage = engine.stagedURL else {
      throw ArchiveDomainError.internal("ZIP64 archive was never inspected")
    }
    precondition(!fileManager.fileExists(atPath: previousStage.path))

    let encrypted = fixtures.appendingPathComponent("zipcrypto.zip")
    do {
      _ = try readZipEntry(at: encrypted, path: "encrypted.txt", limit: 15, password: "wrong")
      throw ArchiveDomainError.internal("Invalid password should fail")
    } catch ArchiveDomainError.badPassword {
    }

    do {
      _ = try readZipEntry(at: interop, path: "stored.txt\0other.txt", limit: 12, password: nil)
      throw ArchiveDomainError.internal("Null byte in path should fail")
    } catch ArchiveDomainError.invalidArgument {
    }

    do {
      _ = try await useCase.execute(input: BufferArchiveInput(data: Data([0x50, 0x4b])))
      throw ArchiveDomainError.internal("Truncated archive should fail")
    } catch ArchiveDomainError.truncatedArchive {
      guard let rejectedStage = engine.stagedURL else {
        throw ArchiveDomainError.internal("Truncated archive was never inspected")
      }
      precondition(!fileManager.fileExists(atPath: rejectedStage.path))
    }

    print("Rust ZIP: metadata, ZIP64 read, typed failures and temporary-file cleanup checks passed")
  }
}
