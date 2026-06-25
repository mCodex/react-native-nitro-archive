package com.mcodex.nitroarchive.application.ports

import com.mcodex.nitroarchive.domain.ProgressSnapshot
import java.io.File

interface ArchiveEngine {
    suspend fun inspect(input: ArchiveInput): ArchiveInspection
    suspend fun readEntry(session: ArchiveEngineSession, path: String, limit: Long, password: String?): ByteArray
    suspend fun extractEntry(session: ArchiveEngineSession, path: String, destination: File, limit: Long, password: String?): Long
    suspend fun createArchive(
        plan: CreationPlan,
        output: ArchiveOutput,
        onProgress: (ProgressSnapshot) -> Unit
    ): CreationResult
}

data class ArchiveInspection(
    val format: String,
    val entryCount: Int,
    val entries: List<EntryDescriptor>,
    val compressedSize: Long?,
    val totalUncompressedSize: Long?,
    val encrypted: Boolean,
    val comment: String?
)

data class EntryDescriptor(
    val index: Int,
    val path: String,
    val kind: String,
    val compressedSize: Long,
    val uncompressedSize: Long,
    val encrypted: Boolean,
    val compressionMethod: String,
    val crc32: UInt? = null,
    val unixMode: UShort? = null
)

data class CreationPlan(
    val entries: List<EntryInput>,
    val compressionProfile: String?,
    val compressionLevel: Int?,
    val storeAlreadyCompressed: Boolean,
    val encryptionMethod: String? = null,
    val encryptionPassword: String? = null
)

data class EntryInput(
    val kind: String,
    val sourcePath: String?,
    val archivePath: String,
    val data: ByteArray?
)

data class CreationResult(
    val entryCount: Int,
    val inputBytes: Long,
    val outputBytes: Long
)
