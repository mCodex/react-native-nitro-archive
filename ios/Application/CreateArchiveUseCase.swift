import Foundation

final class CreateArchiveUseCase {
  private let engine: ArchiveEngine

  init(engine: ArchiveEngine) {
    self.engine = engine
  }

  func execute(plan: CreationPlan, output: ArchiveOutput, onProgress: @escaping (ProgressSnapshot) -> Void) async throws -> CreationResult {
    try await engine.createArchive(plan: plan, output: output, onProgress: onProgress)
  }
}
