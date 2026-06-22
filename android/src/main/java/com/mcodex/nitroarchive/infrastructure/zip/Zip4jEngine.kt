package com.mcodex.nitroarchive.infrastructure.zip

import com.mcodex.nitroarchive.application.ports.*
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.ProgressSnapshot
import net.lingala.zip4j.ZipFile
import net.lingala.zip4j.model.FileHeader
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.CompressionMethod
import net.lingala.zip4j.model.enums.CompressionLevel
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class Zip4jEngine : ArchiveEngine {

    override suspend fun inspect(input: ArchiveInput): ArchiveInspection {
        val data = input.openForRandomAccess()
        val tempFile = java.io.File.createTempFile("nitro-inspect-", ".zip")
        try {
            tempFile.writeBytes(data)
            ZipFile(tempFile).use { zipFile ->
                val headers = zipFile.fileHeaders
                val sortedHeaders = headers.sortedBy { it.fileName }
                var totalCompressed = 0L
                var totalUncompressed = 0L
                var hasEncrypted = false

                val entries = sortedHeaders.mapIndexed { index, header ->
                    val kind = when {
                        header.isDirectory -> "directory"
                        else -> "file"
                    }
                    val compMethod = when (header.compressionMethod) {
                        CompressionMethod.DEFLATE -> "deflate"
                        else -> "store"
                    }
                    if (header.isEncrypted) hasEncrypted = true
                    totalCompressed += header.compressedSize
                    totalUncompressed += header.uncompressedSize

                    EntryDescriptor(
                        index = index,
                        path = header.fileName,
                        kind = kind,
                        compressedSize = header.compressedSize,
                        uncompressedSize = header.uncompressedSize,
                        encrypted = header.isEncrypted,
                        compressionMethod = compMethod,
                        crc32 = (header.crc.takeIf { it >= 0L } ?: 0L).toUInt(),
                        unixMode = null
                    )
                }

                return ArchiveInspection(
                    format = "zip",
                    entryCount = entries.size,
                    entries = entries,
                    compressedSize = totalCompressed,
                    totalUncompressedSize = totalUncompressed,
                    encrypted = hasEncrypted,
                    comment = zipFile.comment.takeIf { it.isNotEmpty() }
                )
            }
        } finally {
            tempFile.delete()
        }
    }

    override suspend fun readEntry(
        session: ArchiveEngineSession,
        path: String,
        limit: Long,
        password: String?
    ): ByteArray {
        val data = session.archiveData
            ?: throw ArchiveDomainError.Internal("Archive data not available")
        val tempFile = java.io.File.createTempFile("nitro-read-", ".zip")
        try {
            tempFile.writeBytes(data)
            ZipFile(tempFile, password?.toCharArray()).use { zipFile ->
                val header = zipFile.fileHeaders.find { it.fileName == path }
                    ?: throw ArchiveDomainError.EntryNotFound(path)
                val baos = ByteArrayOutputStream()
                zipFile.getInputStream(header).use { inputStream ->
                    val buffer = ByteArray(8192)
                    var totalRead = 0L
                    var bytesRead: Int
                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        val chunkSize = minOf(bytesRead.toLong(), limit - totalRead).toInt()
                        baos.write(buffer, 0, chunkSize)
                        totalRead += chunkSize
                        if (totalRead >= limit) break
                    }
                }
                return baos.toByteArray()
            }
        } finally {
            tempFile.delete()
        }
    }

    override suspend fun createArchive(
        plan: CreationPlan,
        output: ArchiveOutput,
        onProgress: (ProgressSnapshot) -> Unit
    ): CreationResult {
        throw ArchiveDomainError.UnsupportedFormat("Archive creation not yet implemented")
    }
}
