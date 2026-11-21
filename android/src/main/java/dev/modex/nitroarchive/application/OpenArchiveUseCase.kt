package dev.modex.nitroarchive.application

import dev.modex.nitroarchive.application.ports.ArchiveEngineSession
import dev.modex.nitroarchive.application.ports.ArchiveInput
import dev.modex.nitroarchive.application.ports.ArchiveInspection
import dev.modex.nitroarchive.application.ports.EntryDescriptor

data class OpenArchiveResult(
    val inspection: ArchiveInspection,
    val session: ArchiveEngineSession
)

class OpenArchiveUseCase(private val inspect: (ByteArray) -> ArchiveInspection) {

    suspend fun execute(input: ArchiveInput): OpenArchiveResult {
        val data = input.openForRandomAccess()
        val inspection = inspect(data)
        val session = object : ArchiveEngineSession {
            override val entries: List<EntryDescriptor> = inspection.entries
            override val archiveData: ByteArray = data

            override fun entry(at: String): EntryDescriptor? {
                return inspection.entries.find { it.path == at }
            }
        }
        return OpenArchiveResult(inspection = inspection, session = session)
    }
}
