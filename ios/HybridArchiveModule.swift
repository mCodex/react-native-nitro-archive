import Foundation
import NitroModules

final class HybridArchiveModule: HybridArchiveModuleSpec {
  private let engine: ArchiveEngine
  private let accessInspector: ArchiveAccessInspecting

  override init() {
    self.engine = ZIPFoundationEngine()
    self.accessInspector = IOSArchiveAccessInspector()
    super.init()
  }

  func getCapabilities() throws -> NativeArchiveCapabilities {
    NativeArchiveCapabilities(
      platform: .ios,
      readableFormats: ["zip"],
      writableFormats: ["zip"],
      compressionMethods: ["store", "deflate"],
      encryptionMethods: ["none"],
      supportsFilePaths: true,
      supportsInputUris: true,
      supportsOutputUris: true,
      supportsDirectoryUris: true,
      supportsAtomicPathWrites: true,
      supportsSecurityScopedUrls: true,
      supportsZip64: true
    )
  }

  func checkFileAccess(path: String, mode: String) throws -> Promise<NativeAccessOutcome> {
    Promise.async {
      let accessMode: ArchiveAccessMode = mode == "write" || mode == "create-children" ? .write : .read
      let report = self.accessInspector.checkFileAccess(path: path, mode: accessMode)
      return NativeAccessOutcome(
        ok: report.accessible,
        accessible: report.accessible,
        readable: report.readable,
        writable: report.writable,
        persistent: true,
        securityScoped: false,
        providerBacked: false,
        seekable: true,
        reason: report.reason,
        recoveryAction: report.accessible ? "none" : "choose-document",
        error: report.accessible ? nil : NativeArchiveFailure(code: .ePermissionDenied, message: report.reason ?? "Access denied", operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil)
      )
    }
  }

  func checkUriAccess(uri: String, mode: String) throws -> Promise<NativeAccessOutcome> {
    Promise.async {
      let accessMode: ArchiveAccessMode = mode == "write" || mode == "create-children" ? .write : .read
      let report = self.accessInspector.checkUriAccess(uri: uri, mode: accessMode)
      return NativeAccessOutcome(
        ok: report.accessible,
        accessible: report.accessible,
        readable: report.readable,
        writable: report.writable,
        persistent: false,
        securityScoped: true,
        providerBacked: false,
        seekable: true,
        reason: report.reason,
        recoveryAction: report.accessible ? "none" : "reselect-document",
        error: report.accessible ? nil : NativeArchiveFailure(code: .ePermissionDenied, message: report.reason ?? "Access denied", operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil)
      )
    }
  }

  func detectFile(path: String) throws -> Promise<NativeDetectionOutcome> {
    Promise.async {
      guard let signature = try? Data(contentsOf: URL(fileURLWithPath: path), options: .alwaysMapped),
            signature.count >= 4 else {
        return NativeDetectionOutcome(ok: true, format: nil, confidence: 0, extensionMatches: nil, error: nil)
      }
      let isZip = signature[0] == 0x50 && signature[1] == 0x4B && signature[2] == 0x03 && signature[3] == 0x04
      let extMatch = path.hasSuffix(".zip")
      return NativeDetectionOutcome(
        ok: true,
        format: isZip ? "zip" : nil,
        confidence: isZip ? 1.0 : 0,
        extensionMatches: extMatch,
        error: nil
      )
    }
  }

  func detectUri(uri: String) throws -> Promise<NativeDetectionOutcome> {
    Promise.async {
      guard let url = URL(string: uri) else {
        return NativeDetectionOutcome(ok: false, format: nil, confidence: 0, extensionMatches: nil, error: NativeArchiveFailure(code: .eInvalidArgument, message: "Invalid URI", operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
      }
      return try await self.detectFile(path: url.path).await()
    }
  }

  func detectBuffer(data: ArrayBuffer) throws -> Promise<NativeDetectionOutcome> {
    Promise.async {
      let ptr = data.data
      let count = data.size
      guard count >= 4 else {
        return NativeDetectionOutcome(ok: true, format: nil, confidence: 0, extensionMatches: nil, error: nil)
      }
      let bytes = UnsafeBufferPointer(start: ptr, count: count)
      let isZip = bytes[0] == 0x50 && bytes[1] == 0x4B && bytes[2] == 0x03 && bytes[3] == 0x04
      return NativeDetectionOutcome(ok: true, format: isZip ? "zip" : nil, confidence: isZip ? 1.0 : 0, extensionMatches: nil, error: nil)
    }
  }

  func openFile(path: String, options: NativePathOpenOptions) throws -> Promise<NativeOpenOutcome> {
    Promise.async {
      let input = LocalFileInput(path: path)
      let useCase = OpenArchiveUseCase(engine: self.engine)
      do {
        let result = try await useCase.execute(input: input)
        let reader = HybridArchiveReader(
          inspection: result.inspection,
          session: result.session,
          engine: self.engine
        )
        return NativeOpenOutcome(ok: true, reader: reader, error: nil)
      } catch let error as ArchiveDomainError {
        return NativeOpenOutcome(ok: false, reader: nil, error: NativeArchiveFailure(code: self.mapCode(error.code), message: "\(error)", operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
      } catch {
        return NativeOpenOutcome(ok: false, reader: nil, error: NativeArchiveFailure(code: .eIo, message: error.localizedDescription, operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
      }
    }
  }

  func openUri(uri: String, options: NativeUriOpenOptions) throws -> Promise<NativeOpenOutcome> {
    Promise.async {
      guard let url = URL(string: uri), url.isFileURL else {
        return NativeOpenOutcome(ok: false, reader: nil, error: NativeArchiveFailure(code: .eInvalidArgument, message: "Not a file URL", operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
      }
      let pathOptions = NativePathOpenOptions(
        password: options.password,
        maxEntriesToIndex: options.maxEntriesToIndex,
        maxCentralDirectoryBytes: options.maxCentralDirectoryBytes
      )
      return try await self.openFile(path: url.path, options: pathOptions).await()
    }
  }

  func openBuffer(data: ArrayBuffer, options: NativeBufferOpenOptions) throws -> Promise<NativeOpenOutcome> {
    Promise.async {
      let swiftData = Data(bytes: data.data, count: data.size)
      let input = BufferArchiveInput(data: swiftData)
      let useCase = OpenArchiveUseCase(engine: self.engine)
      do {
        let result = try await useCase.execute(input: input)
        let reader = HybridArchiveReader(
          inspection: result.inspection,
          session: result.session,
          engine: self.engine
        )
        return NativeOpenOutcome(ok: true, reader: reader, error: nil)
      } catch let error as ArchiveDomainError {
        return NativeOpenOutcome(ok: false, reader: nil, error: NativeArchiveFailure(code: self.mapCode(error.code), message: "\(error)", operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
      } catch {
        return NativeOpenOutcome(ok: false, reader: nil, error: NativeArchiveFailure(code: .eIo, message: error.localizedDescription, operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
      }
    }
  }

  func create(request: NativeCreationRequest) throws -> (any HybridNativeCreationTaskSpec) {
    throw ArchiveDomainError.unsupportedFormat("Creating archives is not yet implemented")
  }

  private func mapCode(_ code: String) -> ArchiveErrorCode {
    ArchiveErrorCode(fromString: code) ?? .eInternal
  }
}
