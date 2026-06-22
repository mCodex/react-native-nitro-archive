package com.mcodex.nitroarchive.infrastructure.storage

import com.mcodex.nitroarchive.application.ports.ArchiveInput
import java.io.File

class LocalFileInput(private val path: String) : ArchiveInput {

    override val estimatedSize: Long?
        get() = File(path).takeIf { it.exists() }?.length()

    override suspend fun openForRandomAccess(): ByteArray {
        return File(path).readBytes()
    }
}
