package com.mcodex.nitroarchive.infrastructure.zip

import com.mcodex.nitroarchive.application.ports.*
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.ProgressSnapshot
import net.lingala.zip4j.ZipFile
import net.lingala.zip4j.model.FileHeader
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.CompressionMethod
import net.lingala.zip4j.model.enums.CompressionLevel
import net.lingala.zip4j.model.enums.EncryptionMethod
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
                        val remaining = limit - totalRead
                        if (remaining <= 0) break
                        val chunkSize = minOf(bytesRead.toLong(), remaining).toInt()
                        baos.write(buffer, 0, chunkSize)
                        totalRead += chunkSize
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
        val useDeflate = when {
            plan.compressionLevel != null -> plan.compressionLevel > 0
            plan.compressionProfile == "fastest" -> false
            else -> true
        }
        val storeAlreadyCompressed = plan.storeAlreadyCompressed
        val encryptionMethod = Zip4jEncryptionMapper.toZip4j(plan.encryptionMethod)
        val encryptionPassword = plan.encryptionPassword?.toCharArray()

        val zipCompressionMethod = if (useDeflate) CompressionMethod.DEFLATE else CompressionMethod.STORE
        val zipLevel = when (plan.compressionLevel) {
            in 0..1 -> CompressionLevel.FASTEST
            in 2..4 -> CompressionLevel.FAST
            in 5..7 -> CompressionLevel.NORMAL
            in 8..9 -> CompressionLevel.ULTRA
            else -> if (useDeflate) CompressionLevel.NORMAL else CompressionLevel.NO_COMPRESSION
        }

        val tempFile = java.io.File.createTempFile("nitro-create-", ".zip")
        try {
            ZipFile(tempFile, encryptionPassword).use { zipFile ->
                var totalInputBytes = 0L
                var totalOutputBytes = 0L
                val totalEntries = plan.entries.size

                for ((index, entry) in plan.entries.withIndex()) {
                    val archivePath = entry.archivePath

                    onProgress(ProgressSnapshot(
                        operationId = "",
                        phase = "compressing",
                        processedBytes = totalInputBytes,
                        totalBytes = null,
                        processedEntries = index,
                        totalEntries = totalEntries,
                        currentEntry = archivePath
                    ))

                    when (entry.kind) {
                        "file" -> {
                            val sourcePath = entry.sourcePath
                                ?: throw ArchiveDomainError.InvalidArgument("File entry requires sourcePath")
                            val sourceFile = java.io.File(sourcePath)
                            if (!sourceFile.exists()) {
                                throw ArchiveDomainError.FileNotAvailable(sourcePath)
                            }
                            totalInputBytes += sourceFile.length()

                            val params = ZipParameters().apply {
                                fileNameInZip = archivePath
                                this.compressionMethod = zipCompressionMethod
                                this.compressionLevel = zipLevel
                                if (encryptionMethod != null) {
                                    isEncryptFiles = true
                                    this.encryptionMethod = encryptionMethod
                                }
                            }
                            zipFile.addFile(sourceFile, params)
                        }

                        "buffer" -> {
                            val data = entry.data
                                ?: throw ArchiveDomainError.InvalidArgument("Buffer entry requires data")
                            totalInputBytes += data.size.toLong()

                            val shouldStore = storeAlreadyCompressed && isProbablyCompressed(archivePath)
                            val params = ZipParameters().apply {
                                fileNameInZip = archivePath
                                this.compressionMethod = if (shouldStore) CompressionMethod.STORE else zipCompressionMethod
                                this.compressionLevel = if (shouldStore) CompressionLevel.NO_COMPRESSION else zipLevel
                                if (encryptionMethod != null) {
                                    isEncryptFiles = true
                                    this.encryptionMethod = encryptionMethod
                                }
                            }
                            zipFile.addStream(java.io.ByteArrayInputStream(data), params)
                        }

                        "directory" -> {
                            val dirPath = archivePath.trimEnd('/') + "/"
                            val params = ZipParameters().apply {
                                fileNameInZip = dirPath
                                this.compressionMethod = CompressionMethod.STORE
                                this.compressionLevel = CompressionLevel.NO_COMPRESSION
                                if (encryptionMethod != null) {
                                    isEncryptFiles = true
                                    this.encryptionMethod = encryptionMethod
                                }
                            }
                            zipFile.addStream(java.io.ByteArrayInputStream(ByteArray(0)), params)
                        }

                        else -> throw ArchiveDomainError.InvalidArgument("Unsupported entry kind: ${entry.kind}")
                    }
                }

                val archiveBytes = tempFile.readBytes()
                totalOutputBytes = archiveBytes.size.toLong()

                output.write(archiveBytes)
                output.finalize()

                onProgress(ProgressSnapshot(
                    operationId = "",
                    phase = "finalizing",
                    processedBytes = totalInputBytes,
                    totalBytes = null,
                    processedEntries = totalEntries,
                    totalEntries = totalEntries,
                    currentEntry = null
                ))

                return CreationResult(
                    entryCount = totalEntries,
                    inputBytes = totalInputBytes,
                    outputBytes = totalOutputBytes
                )
            }
        } finally {
            tempFile.delete()
        }
    }

    private fun isProbablyCompressed(path: String): Boolean {
        val ext = path.substringAfterLast('.', "").lowercase()
        return ext in setOf(
            "jpg", "jpeg", "png", "webp", "avif", "heic",
            "mp4", "mov", "m4v", "mp3", "aac", "m4a", "ogg",
            "zip", "gz", "zst"
        )
    }
}
