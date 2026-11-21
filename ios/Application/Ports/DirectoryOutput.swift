import Foundation

protocol DirectoryOutput {
  func prepareDirectory(at path: String) async throws
  func installFile(from source: FileHandle, at path: String, checkCancellation: () throws -> Void) async throws
  func commit() async throws
  func rollback() async throws
}
