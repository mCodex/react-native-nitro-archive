package dev.modex.nitroarchive.application.ports

interface ArchiveInput {
    suspend fun openForRandomAccess(): ByteArray
}

interface ArchiveEngineSession {
    fun entry(at: String): EntryDescriptor?
    val entries: List<EntryDescriptor>
    val archiveData: ByteArray
}
