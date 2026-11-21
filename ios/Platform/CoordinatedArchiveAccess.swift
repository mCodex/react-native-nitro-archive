import Foundation

func withCoordinatedArchiveURL<Value>(
  _ url: URL, securityScope: String?, mode: ArchiveAccessMode,
  _ action: (URL) throws -> Value
) throws -> Value {
  let scoped = securityScope != "disabled" && url.startAccessingSecurityScopedResource()
  guard securityScope != "required" || scoped else {
    throw ArchiveDomainError.securityScopeRequired
  }
  defer { if scoped { url.stopAccessingSecurityScopedResource() } }

  let coordinator = NSFileCoordinator(filePresenter: nil)
  var coordinatorError: NSError?
  var result: Result<Value, Error>?
  switch mode {
  case .read:
    coordinator.coordinate(readingItemAt: url, options: [], error: &coordinatorError) {
      coordinatedURL in result = Result { try action(coordinatedURL) }
    }
  case .write, .createChildren:
    coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &coordinatorError) {
      coordinatedURL in result = Result { try action(coordinatedURL) }
    }
  }
  guard let result else { throw ArchiveDomainError.ioError("File coordination failed") }
  return try result.get()
}
