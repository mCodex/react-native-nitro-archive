package com.mcodex.nitroarchive.application.ports

interface ArchiveInput {
    suspend fun openForRandomAccess(): ByteArray
    val estimatedSize: Long?
}

interface ArchiveEngineSession {
    fun entry(at: String): EntryDescriptor?
    val entries: List<EntryDescriptor>
    val archiveData: ByteArray?
}
