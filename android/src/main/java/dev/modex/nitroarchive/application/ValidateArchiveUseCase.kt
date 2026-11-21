package dev.modex.nitroarchive.application

import dev.modex.nitroarchive.application.ports.*
import dev.modex.nitroarchive.domain.ProgressSnapshot

data class ValidationSummary(
    val valid: Boolean,
    val checkedEntries: Int,
    val checkedUncompressedBytes: Long,
    val encryptedEntries: Int,
    val issues: List<String>
)

class ValidateArchiveUseCase(private val engine: ArchiveEngine) {

    suspend fun execute(
        session: ArchiveEngineSession,
        onProgress: (ProgressSnapshot) -> Unit = {}
    ): ValidationSummary {
        val entries = session.entries
        var encryptedCount = 0
        var totalUncompressed = 0L
        val issues = mutableListOf<String>()

        for (entry in entries) {
            if (entry.encrypted) encryptedCount++
            totalUncompressed += entry.uncompressedSize
        }

        return ValidationSummary(
            valid = issues.isEmpty(),
            checkedEntries = entries.size,
            checkedUncompressedBytes = totalUncompressed,
            encryptedEntries = encryptedCount,
            issues = issues
        )
    }
}
