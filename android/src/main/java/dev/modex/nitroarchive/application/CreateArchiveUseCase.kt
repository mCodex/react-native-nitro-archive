package com.mcodex.nitroarchive.application

import com.mcodex.nitroarchive.application.ports.*
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.ProgressSnapshot

class CreateArchiveUseCase(private val engine: ArchiveEngine) {

    suspend fun execute(
        plan: CreationPlan,
        output: ArchiveOutput,
        onProgress: (ProgressSnapshot) -> Unit = {}
    ): CreationResult {
        return engine.createArchive(plan = plan, output = output, onProgress = onProgress)
    }
}
