package com.mcodex.nitroarchive.application.ports

interface ArchiveOutput {
    suspend fun write(data: ByteArray)
    suspend fun finalize()
}
