package com.mcodex.nitroarchive.infrastructure.memory

import com.mcodex.nitroarchive.application.ports.ArchiveInput

class BufferArchiveInput(private val data: ByteArray) : ArchiveInput {
    override val estimatedSize: Long? get() = data.size.toLong()

    override suspend fun openForRandomAccess(): ByteArray = data
}
