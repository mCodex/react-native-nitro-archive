package dev.modex.nitroarchive.infrastructure.storage

import dev.modex.nitroarchive.application.ports.ArchiveInput
import dev.modex.nitroarchive.domain.ArchiveDomainError
import java.io.File

class LocalFileInput(private val path: String) : ArchiveInput {
    override suspend fun openForRandomAccess(): ByteArray {
        return File(path).inputStream().use { input ->
            val initialSize = input.channel.size()
            if (initialSize > MAX_ARCHIVE_INPUT_BYTES) {
                throw ArchiveDomainError.ArchiveTooLarge()
            }
            input.readArchiveBytes(initialSize.toInt())
        }
    }
}
