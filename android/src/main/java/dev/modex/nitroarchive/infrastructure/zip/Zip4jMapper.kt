package dev.modex.nitroarchive.infrastructure.zip

import dev.modex.nitroarchive.domain.ArchiveDomainError

object Zip4jMapper {
    fun mapError(error: Exception): ArchiveDomainError {
        if (error is ArchiveDomainError) return error
        return ArchiveDomainError.IoError("Zip4j error: ${error.message}")
    }
}
