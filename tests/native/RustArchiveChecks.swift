import Foundation

@main
enum RustArchiveChecks {
  static func main() async throws {
    let workspace = try ArchiveWorkspace()
    let path = workspace.directory
    defer { withExtendedLifetime(workspace) {} }

    let fixtures = CommandLine.arguments.dropFirst().first ?? "rust/tests/fixtures"
    let fixture = URL(fileURLWithPath: fixtures, isDirectory: true)
    let input = fixture.appendingPathComponent("interop.zip")
    let archive = try inspectArchive(at: input)
    precondition(archive.entries.map(\.path) == ["stored.txt", "files/", "files/café.txt"])
    precondition(archive.entries.map(\.index) == [0, 1, 2])
    precondition(archive.totalUncompressedSize == 1036)
    precondition(archive.comment == "independent ZIP fixture")

    let engine = RustArchiveEngine()
    let open = OpenArchiveUseCase(engine: engine)
    let zip64 = fixture.appendingPathComponent("zip64.zip")
    let bytes = Data("ZIP64 payload\n".utf8)
    var staged: URL?

    do {
      let opened = try await open.execute(input: LocalFileInput(path: zip64.path))
      let stagedURL = opened.session.archiveURL
      staged = stagedURL
      let entry = opened.session.entry(at: "zip64.txt")
      let payload = try await engine.readEntry(
        session: opened.session, path: "zip64.txt", limit: 14, password: nil
      )
      precondition(stagedURL != zip64 && FileManager.default.fileExists(atPath: stagedURL.path))
      precondition(entry?.index == 0 && entry?.uncompressedSize == 14)
      precondition(payload == bytes)
    }
    guard let staged else { fatalError("Expected a staged archive") }
    precondition(!FileManager.default.fileExists(atPath: staged.path))

    for format in ["zip", "tar", "tar.gz"] {
      let password = format == "zip" ? "integration-password" : nil
      let plan = makePlan(format: format, bytes: bytes, password: password)
      let output = path.appendingPathComponent("new." + format)
      let writer = try LocalArchiveDestination(path: output.path, replaceExisting: false)
      let created = try engine.createArchive(plan: plan, outputFd: writer.file.fileDescriptor) { _, _ in true }
      precondition(created.entryCount == 1 && created.inputBytes == bytes.count)
      precondition(!FileManager.default.fileExists(atPath: output.path))
      try writer.commit()

      let detection = try detectArchive(at: output)
      precondition(detection.format == format)
      let bufferDetection = try detectArchive(in: Data(contentsOf: output))
      precondition(bufferDetection.format == format)
      let opened = try await open.execute(input: LocalFileInput(path: output.path))
      precondition(opened.inspection.format == format)
      let entry = opened.session.entries.first
      precondition(entry?.crc32 != nil ? format == "zip" : format != "zip")
      let payload = try await engine.readEntry(
        session: opened.session, path: "nested/data.txt", limit: 14, password: password
      )
      precondition(payload == bytes)

      let destinationURL = path.appendingPathComponent("extract-" + format)
      let destination = SafeDirectoryOutput(baseURL: destinationURL)
      let extractionPlan = try ExtractionPlanner().planExtraction(
        entries: opened.session.entries, include: nil, exclude: nil, limits: .default,
        destination: destinationURL, checkEntryCompressionRatio: format != "tar.gz"
      )
      let result = try await ExtractArchiveUseCase(engine: engine).execute(
        session: opened.session, plan: extractionPlan, destination: destination,
        limits: .default, password: password, checkCancellation: {}, onProgress: { _, _, _ in }
      )
      try await destination.commit()

      precondition(result.extractedEntries == 1 && result.writtenBytes == bytes.count)
      let extracted = try Data(contentsOf: destinationURL.appendingPathComponent("nested/data.txt"))
      precondition(extracted == bytes)

      let secondWriter = try LocalArchiveDestination(path: output.path, replaceExisting: false)
      try secondWriter.file.write(contentsOf: Data("replacement".utf8))
      do {
        try secondWriter.commit()
        fatalError("Existing archive should survive an exclusive commit")
      } catch ArchiveDomainError.destinationExists {
        let stillDetected = try detectArchive(at: output)
        precondition(stillDetected.format == format)
      }
    }

    let encrypted = fixture.appendingPathComponent("zipcrypto.zip")
    do {
      _ = try readArchiveEntry(at: encrypted, path: "encrypted.txt", limit: 15, password: "wrong")
      fatalError("Invalid password should fail")
    } catch ArchiveDomainError.badPassword {
    }

    do {
      _ = try readArchiveEntry(at: input, path: "stored.txt\0other.txt", limit: 12, password: nil)
      fatalError("Null byte in path should fail")
    } catch ArchiveDomainError.invalidArgument {
    }

    do {
      _ = try await open.execute(input: BufferArchiveInput(data: Data([0x50, 0x4b])))
      fatalError("Truncated archive should fail")
    } catch ArchiveDomainError.truncatedArchive {
    }

    let cancelled = path.appendingPathComponent("cancelled.zip")
    let writer = try LocalArchiveDestination(path: cancelled.path, replaceExisting: false)
    let plan = makePlan(format: "zip", bytes: bytes, password: nil)
    do {
      _ = try engine.createArchive(plan: plan, outputFd: writer.file.fileDescriptor) { _, _ in false }
      fatalError("Cancellation should fail the archive operation")
    } catch ArchiveDomainError.operationCancelled {
      precondition(!FileManager.default.fileExists(atPath: cancelled.path))
    }

    let life = TaskStateMachine()
    try life.start()
    precondition(life.cancel())
    life.fail()
    precondition(life.state == .cancelled)

    print("Swift/Rust archives passed ZIP, TAR, TAR.GZ, ZIP64, verification, cancellation, and publication checks")
  }

  private static func makePlan(format: String, bytes: Data, password: String?) -> CreationPlan {
    CreationPlan(
      format: format,
      entries: [EntryInput(
        kind: "buffer", sourcePath: nil, sourceUri: nil, iosSecurityScope: nil,
        archivePath: "nested/data.txt", data: bytes,
        recursive: nil, includeHidden: nil, followSymlinks: nil, include: nil, exclude: nil,
        compressionMethod: nil, modifiedAt: nil
      )],
      compressionProfile: "balanced", compressionLevel: nil, storeAlreadyCompressed: true,
      encryptionMethod: password == nil ? nil : "aes-256", encryptionPassword: password,
      includeEmptyDirectories: true, preserveTimestamps: true
    )
  }
}
