package com.mcodex.nitroarchive.application

import com.mcodex.nitroarchive.application.ports.*
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.ExtractionLimits

data class ExtractionSummary(
    val extractedEntries: Int,
    val skippedEntries: Int,
    val writtenBytes: Long
)

class ExtractArchiveUseCase(private val engine: ArchiveEngine) {

    suspend fun execute(
        session: ArchiveEngineSession,
        entries: List<EntryDescriptor>,
        output: DirectoryOutput,
        limits: ExtractionLimits = ExtractionLimits.DEFAULT,
        password: String? = null,
        onEntryProgress: (path: String, index: Int, total: Int) -> Unit = { _, _, _ -> }
    ): ExtractionSummary {
        var extracted = 0
        var skipped = 0
        var written = 0L

        for ((i, descriptor) in entries.withIndex()) {
            onEntryProgress(descriptor.path, i, entries.size)

            val parentDir = if (descriptor.path.contains("/")) {
                descriptor.path.substringBeforeLast("/")
            } else ""

            when (descriptor.kind) {
                "directory" -> {
                    output.prepareDirectory(at = descriptor.path)
                    extracted++
                }
                "file" -> {
                    if (descriptor.uncompressedSize > limits.maxEntryUncompressedBytes) {
                        throw ArchiveDomainError.ExtractionLimitExceeded(
                            limit = "maxEntryUncompressedBytes",
                            value = "${descriptor.uncompressedSize}"
                        )
                    }

                    if (parentDir.isNotEmpty()) {
                        output.prepareDirectory(at = parentDir)
                    }
                    val file = output.createFile(at = descriptor.path)

                    val bytesWritten = engine.extractEntry(
                        session = session,
                        path = descriptor.path,
                        destination = file,
                        limit = limits.maxEntryUncompressedBytes,
                        password = password
                    )

                    extracted++
                    written += bytesWritten
                }
                else -> skipped++
            }
        }

        return ExtractionSummary(
            extractedEntries = extracted,
            skippedEntries = skipped,
            writtenBytes = written
        )
    }
}
