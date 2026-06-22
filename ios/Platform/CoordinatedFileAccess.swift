import Foundation

final class CoordinatedFileAccess {
  private let coordinator = NSFileCoordinator(filePresenter: nil)

  func coordinatedRead(at url: URL) throws -> Data {
    var coordinationError: NSError?
    var readData: Data?
    var readError: Error?

    coordinator.coordinate(readingItemAt: url, options: .withoutChanges, error: &coordinationError) { readURL in
      do {
        readData = try Data(contentsOf: readURL)
      } catch {
        readError = error
      }
    }

    if let error = readError { throw error }
    if let data = readData { return data }
    if let error = coordinationError { throw ArchiveDomainError.ioError("Coordinated read failed: \(error.localizedDescription)") }
    throw ArchiveDomainError.internal("File coordination failed")
  }
}
