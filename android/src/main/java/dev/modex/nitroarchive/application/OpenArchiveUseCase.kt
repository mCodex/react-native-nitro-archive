package com.mcodex.nitroarchive.application

import com.mcodex.nitroarchive.application.ports.*

data class OpenArchiveResult(
    val inspection: ArchiveInspection,
    val session: ArchiveEngineSession
)

class OpenArchiveUseCase(private val engine: ArchiveEngine) {

    suspend fun execute(input: ArchiveInput): OpenArchiveResult {
        val inspection = engine.inspect(input)
        val data = input.openForRandomAccess()
        val session = object : ArchiveEngineSession {
            override val entries: List<EntryDescriptor> = inspection.entries
            override val archiveData: ByteArray? = data

            override fun entry(at: String): EntryDescriptor? {
                return inspection.entries.find { it.path == at }
            }
        }
        return OpenArchiveResult(inspection = inspection, session = session)
    }
}
