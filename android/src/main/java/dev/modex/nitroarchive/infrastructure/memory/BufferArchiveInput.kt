package dev.modex.nitroarchive.infrastructure.memory

import dev.modex.nitroarchive.application.ports.ArchiveInput

class BufferArchiveInput(private val data: ByteArray) : ArchiveInput {
    override suspend fun openForRandomAccess(): ByteArray = data
}
