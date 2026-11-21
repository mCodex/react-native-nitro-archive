import Foundation
import NitroModules

final class HybridArchiveModule: HybridArchiveModuleSpec {
  private let engine: ArchiveEngine
  private let accessInspector: ArchiveAccessInspecting

  override init() {
    self.engine = RustArchiveEngine()
    self.accessInspector = IOSArchiveAccessInspector()
    super.init()
  }

  func getCapabilities() throws -> NativeArchiveCapabilities {
    NativeArchiveCapabilities(
      platform: .ios,
      readableFormats: ["zip", "tar", "tar.gz"],
      writableFormats: ["zip", "tar", "tar.gz"],
      compressionMethods: ["store", "deflate"],
      encryptionMethods: ["none", "zip-crypto", "aes-256"],
      supportsFilePaths: true,
      supportsInputUris: true,
      supportsOutputUris: true,
      supportsDirectoryUris: false,
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
      self.detect(url: URL(fileURLWithPath: path))
    }
  }

  func detectUri(uri: String) throws -> Promise<NativeDetectionOutcome> {
    Promise.async {
      guard let url = URL(string: uri), url.isFileURL else {
        return self.detectionFailure(.invalidArgument("Not a file URL"))
      }
      do {
        return try withCoordinatedArchiveURL(url, securityScope: nil, mode: .read) {
          self.detect(url: $0)
        }
      } catch let error as ArchiveDomainError {
        return self.detectionFailure(error)
      } catch {
        return self.detectionFailure(.ioError("Archive detection failed"))
      }
    }
  }

  func detectBuffer(data: ArrayBuffer) throws -> Promise<NativeDetectionOutcome> {
    guard data.size <= 512 * 1024 * 1024 else {
      return Promise.async { self.detectionFailure(.archiveTooLarge) }
    }
    let bytes = Data(bytes: data.data, count: data.size)
    return Promise.async {
      do {
        return self.detectionOutcome(try detectArchive(in: bytes), name: nil)
      } catch let error as ArchiveDomainError {
        return self.detectionFailure(error)
      } catch {
        return self.detectionFailure(.ioError("Archive detection failed"))
      }
    }
  }

  private func detect(url: URL) -> NativeDetectionOutcome {
    do {
      return detectionOutcome(try detectArchive(at: url), name: url.lastPathComponent)
    } catch let error as ArchiveDomainError {
      return detectionFailure(error)
    } catch {
      return detectionFailure(.ioError("Archive detection failed"))
    }
  }

  private func detectionOutcome(_ result: ArchiveDetection, name: String?) -> NativeDetectionOutcome {
    let matches = name.flatMap { name in result.format.map { name.lowercased().hasSuffix("." + $0) } }
    return NativeDetectionOutcome(
      ok: true, format: result.format, confidence: result.format == nil ? 0 : 1,
      extensionMatches: matches, error: nil
    )
  }

  private func detectionFailure(_ error: ArchiveDomainError) -> NativeDetectionOutcome {
    NativeDetectionOutcome(
      ok: false, format: nil, confidence: 0, extensionMatches: nil, error: nativeArchiveFailure(error)
    )
  }

  func openFile(path: String, options: NativePathOpenOptions) throws -> Promise<NativeOpenOutcome> {
    Promise.async {
      await self.openInput(LocalFileInput(path: path))
    }
  }

  func openUri(uri: String, options: NativeUriOpenOptions) throws -> Promise<NativeOpenOutcome> {
    Promise.async {
      guard let url = URL(string: uri), url.isFileURL else {
        return NativeOpenOutcome(ok: false, reader: nil, error: NativeArchiveFailure(code: .eInvalidArgument, message: "Not a file URL", operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
      }
      return await self.openInput(LocalFileInput(uri: url, securityScope: options.iosSecurityScope))
    }
  }

  func openBuffer(data: ArrayBuffer, options: NativeBufferOpenOptions) throws -> Promise<NativeOpenOutcome> {
    guard data.size <= 512 * 1024 * 1024 else {
      return Promise.async { self.openFailure(.archiveTooLarge) }
    }

    let bytes = Data(bytes: data.data, count: data.size)
    return Promise.async {
      await self.openInput(BufferArchiveInput(data: bytes))
    }
  }

  private func openInput(_ input: ArchiveInput) async -> NativeOpenOutcome {
    let useCase = OpenArchiveUseCase(engine: self.engine)
    do {
      let result = try await useCase.execute(input: input)
      return NativeOpenOutcome(ok: true, reader: HybridArchiveReader(
        inspection: result.inspection,
        session: result.session,
        engine: self.engine
      ), error: nil)
    } catch let error as ArchiveDomainError {
      return openFailure(error)
    } catch {
      return NativeOpenOutcome(ok: false, reader: nil, error: NativeArchiveFailure(code: .eIo, message: error.localizedDescription, operationId: nil, entryPath: nil, source: nil, destination: nil, nativeCode: nil))
    }
  }

  private func openFailure(_ error: ArchiveDomainError) -> NativeOpenOutcome {
    NativeOpenOutcome(ok: false, reader: nil, error: nativeArchiveFailure(error))
  }

  func create(request: NativeCreationRequest) throws -> (any HybridNativeCreationTaskSpec) {
    HybridCreationTask(engine: engine, request: request)
  }

}

func nativeArchiveFailure(_ error: ArchiveDomainError, operationId: String? = nil) -> NativeArchiveFailure {
  NativeArchiveFailure(
    code: ArchiveErrorCode(fromString: error.code) ?? .eInternal,
    message: "\(error)", operationId: operationId, entryPath: nil,
    source: nil, destination: nil, nativeCode: nil
  )
}
