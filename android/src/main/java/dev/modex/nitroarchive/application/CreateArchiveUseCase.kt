package dev.modex.nitroarchive.application

import dev.modex.nitroarchive.application.ports.*
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.ProgressSnapshot

class CreateArchiveUseCase(private val engine: ArchiveEngine) {

    suspend fun execute(
        plan: CreationPlan,
        output: ArchiveOutput,
        onProgress: (ProgressSnapshot) -> Unit = {}
    ): CreationResult {
        return engine.createArchive(plan = plan, output = output, onProgress = onProgress)
    }
}
