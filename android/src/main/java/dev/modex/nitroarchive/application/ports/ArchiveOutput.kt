package dev.modex.nitroarchive.application.ports

interface ArchiveOutput {
    suspend fun write(data: ByteArray)
    suspend fun finalize()
}
