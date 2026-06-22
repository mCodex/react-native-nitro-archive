import Foundation

protocol DirectoryOutput {
  func prepareDirectory(at path: String) async throws
  func createFile(at path: String) async throws -> URL
  func commit() async throws
  func rollback() async throws
}
