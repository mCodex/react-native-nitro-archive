import Foundation
import NitroModules

final class HybridCreationTask: HybridNativeCreationTaskSpec {
  private let stateMachine = TaskStateMachine()
  private let operationId: String
  private let progressReporter: NativeTaskProgress
  private let engine: ArchiveEngine
  private let prepared: Result<PreparedCreation, Error>

  var state: String { stateMachine.state.rawValue }
  var progress: NativeProgress { progressReporter.snapshot }

  init(engine: ArchiveEngine, request: NativeCreationRequest) {
    let id = UUID().uuidString
    operationId = id
    progressReporter = NativeTaskProgress(operationId: id, intervalMs: request.progressIntervalMs)
    self.engine = engine
    prepared = Result { try Self.prepare(request) }
    super.init()
  }

  private static func prepare(_ request: NativeCreationRequest) throws -> PreparedCreation {
    let destinationURL: URL
    let securityScope: String?
    switch request.destinationKind {
    case "file":
      guard let path = request.destinationPath, path.hasPrefix("/"), !path.utf8.contains(0) else {
        throw ArchiveDomainError.invalidArgument("Missing archive destination")
      }
      destinationURL = URL(fileURLWithPath: path)
      securityScope = nil
    case "uri":
      guard let uri = request.destinationUri, let url = URL(string: uri), url.isFileURL else {
        throw ArchiveDomainError.providerUnsupported
      }
      destinationURL = url
      securityScope = request.destinationIosSecurityScope ?? "auto"
    default:
      throw ArchiveDomainError.providerUnsupported
    }
    let memoryLimit = min(try parseNativeByteCount(request.maxInMemoryBytes, default: 16 * 1024 * 1024), 512 * 1024 * 1024)
    var bytes: UInt64 = 0

    for entry in request.entries {
      let (next, overflow) = bytes.addingReportingOverflow(UInt64(entry.data?.size ?? 0))
      guard !overflow, next <= memoryLimit else { throw ArchiveDomainError.bufferLimitExceeded }
      bytes = next
    }

    let entries = request.entries.map { entry in
      EntryInput(
        kind: entry.kind, sourcePath: entry.sourcePath, sourceUri: entry.sourceUri,
        iosSecurityScope: entry.iosSecurityScope,
        archivePath: entry.archivePath, data: entry.data.map { Data(bytes: $0.data, count: $0.size) },
        recursive: entry.recursive, includeHidden: entry.includeHidden, followSymlinks: entry.followSymlinks,
        include: entry.include, exclude: entry.exclude,
        compressionMethod: entry.compressionMethod, modifiedAt: entry.modifiedAt
      )
    }
    let compressionLevel: Int?
    if let level = request.compressionLevel {
      guard let converted = Int(exactly: level), (0...9).contains(converted) else {
        throw ArchiveDomainError.invalidArgument("Invalid compression level")
      }
      compressionLevel = converted
    } else {
      compressionLevel = nil
    }

    let plan = CreationPlan(
      format: request.format ?? "zip", entries: entries,
      compressionProfile: request.compressionProfile, compressionLevel: compressionLevel,
      storeAlreadyCompressed: request.storeAlreadyCompressed ?? true,
      encryptionMethod: request.encryptionMethod, encryptionPassword: request.encryptionPassword,
      includeEmptyDirectories: request.includeEmptyDirectories ?? true,
      preserveTimestamps: request.preserveTimestamps ?? true
    )
    return PreparedCreation(
      plan: plan, destination: destinationURL, securityScope: securityScope,
      replaceExisting: request.existingDestination == "replace"
    )
  }

  func start() throws -> Promise<NativeCreationResult> {
    Promise.async {
      do {
        try self.stateMachine.start()
      } catch let error as ArchiveDomainError {
        return self.failure(error)
      }
      let start = ProcessInfo.processInfo.systemUptime

      do {
        try self.stateMachine.checkCancellation()
        let prepared = try self.prepared.get()
        let result: CreationResult
        if let scope = prepared.securityScope {
          result = try withCoordinatedArchiveURL(prepared.destination, securityScope: scope, mode: .write) {
            try self.writeArchive(prepared, to: $0)
          }
        } else {
          result = try self.writeArchive(prepared, to: prepared.destination)
        }
        try self.stateMachine.succeed()
        self.progressReporter.emit(
          phase: "finalizing", bytes: result.inputBytes, entries: UInt64(result.entryCount),
          totalEntries: result.entryCount, complete: true
        )

        return NativeCreationResult(
          operationId: self.operationId, entryCount: Double(result.entryCount),
          inputBytes: Double(result.inputBytes), outputBytes: Double(result.outputBytes),
          durationMs: (ProcessInfo.processInfo.systemUptime - start) * 1000,
          atomicWriteApplied: true, warnings: [], error: nil
        )
      } catch let error as ArchiveDomainError {
        self.stateMachine.fail(cancelled: error == .operationCancelled)
        return self.failure(error)
      } catch {
        self.stateMachine.fail()
        throw error
      }
    }
  }

  private func failure(_ error: ArchiveDomainError) -> NativeCreationResult {
    NativeCreationResult(
      operationId: operationId, entryCount: 0, inputBytes: 0, outputBytes: 0,
      durationMs: 0, atomicWriteApplied: false, warnings: [], error: nativeArchiveFailure(error, operationId: operationId)
    )
  }

  private func writeArchive(_ prepared: PreparedCreation, to url: URL) throws -> CreationResult {
    let destination = try LocalArchiveDestination(path: url.path, replaceExisting: prepared.replaceExisting)
    progressReporter.emit(phase: "compressing")
    let result = try engine.createArchive(plan: prepared.plan, outputFd: destination.file.fileDescriptor) { bytes, entries in
      guard (try? self.stateMachine.checkCancellation()) != nil else { return false }
      self.progressReporter.emit(phase: "compressing", bytes: bytes, entries: entries)
      return true
    }
    guard result.inputBytes <= 9_007_199_254_740_991, result.outputBytes <= 9_007_199_254_740_991 else {
      throw ArchiveDomainError.archiveTooLarge
    }

    try stateMachine.beginCommit()
    try destination.commit()
    return result
  }

  func cancel() throws -> Bool { stateMachine.cancel() }

  func onProgress(callback: @escaping (NativeProgress) -> Void) throws -> () -> Void {
    progressReporter.setCallback(callback)
    return { [weak self] in self?.progressReporter.setCallback(nil) }
  }
}


private struct PreparedCreation {
  let plan: CreationPlan
  let destination: URL
  let securityScope: String?
  let replaceExisting: Bool
}
