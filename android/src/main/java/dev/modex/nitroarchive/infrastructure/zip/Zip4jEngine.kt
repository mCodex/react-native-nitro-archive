package dev.modex.nitroarchive.infrastructure.zip

import dev.modex.nitroarchive.application.ports.*
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.ProgressSnapshot
import net.lingala.zip4j.ZipFile
import net.lingala.zip4j.exception.ZipException
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.CompressionMethod
import net.lingala.zip4j.model.enums.CompressionLevel
import net.lingala.zip4j.model.enums.EncryptionMethod
import java.io.File

class Zip4jEngine : ArchiveEngine {

    override suspend fun extractEntry(
        session: ArchiveEngineSession,
        path: String,
        destination: File,
        limit: Long,
        password: String?
    ): Long {
        val tempFile = File.createTempFile("nitro-extract-", ".zip")
        try {
            tempFile.writeBytes(session.archiveData)
            ZipFile(tempFile, password?.toCharArray()).use { zipFile ->
                val header = zipFile.fileHeaders.find { it.fileName == path }
                    ?: throw ArchiveDomainError.EntryNotFound(path)
                if (header.isEncrypted && password.isNullOrEmpty()) {
                    throw ArchiveDomainError.PasswordRequired()
                }
                if (header.uncompressedSize > limit) {
                    throw ArchiveDomainError.ExtractionLimitExceeded("maxEntryUncompressedBytes", "${header.uncompressedSize}")
                }
                zipFile.getInputStream(header).use { input ->
                    destination.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var total = 0L
                        var read: Int
                        while (input.read(buffer).also { read = it } != -1) {
                            total += read
                            if (total > limit) {
                                throw ArchiveDomainError.ExtractionLimitExceeded("maxEntryUncompressedBytes", "$total")
                            }
                            output.write(buffer, 0, read)
                        }
                        return total
                    }
                }
            }
        } catch (e: ZipException) {
            throw mapZipException(e)
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
        if (plan.encryptionMethod == "aes-128") {
            throw ArchiveDomainError.UnsupportedEncryption()
        }
        if (Zip4jEncryptionMapper.isEncrypted(plan.encryptionMethod) && plan.encryptionPassword.isNullOrEmpty()) {
            throw ArchiveDomainError.PasswordRequired()
        }
        val encryptionMethod = Zip4jEncryptionMapper.toZip4j(plan.encryptionMethod)
        val aesStrength = Zip4jEncryptionMapper.aesStrength(plan.encryptionMethod)
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
                val totalEntries = plan.entries.size

                for ((index, entry) in plan.entries.withIndex()) {
                    val archivePath = entry.archivePath

                    onProgress(ProgressSnapshot(
                        processedBytes = totalInputBytes,
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
                                    if (aesStrength != null) this.aesKeyStrength = aesStrength
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
                                    if (aesStrength != null) this.aesKeyStrength = aesStrength
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
                                    if (aesStrength != null) this.aesKeyStrength = aesStrength
                                }
                            }
                            zipFile.addStream(java.io.ByteArrayInputStream(ByteArray(0)), params)
                        }

                        else -> throw ArchiveDomainError.InvalidArgument("Unsupported entry kind: ${entry.kind}")
                    }
                }

                val archiveBytes = tempFile.readBytes()
                val totalOutputBytes = archiveBytes.size.toLong()

                output.write(archiveBytes)
                output.finalize()

                onProgress(ProgressSnapshot(
                    processedBytes = totalInputBytes,
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

    private fun mapZipException(error: ZipException): ArchiveDomainError {
        return when (error.type) {
            ZipException.Type.WRONG_PASSWORD -> ArchiveDomainError.BadPassword()
            ZipException.Type.CHECKSUM_MISMATCH -> ArchiveDomainError.ChecksumMismatch(error.message ?: "ZIP checksum mismatch")
            ZipException.Type.UNSUPPORTED_ENCRYPTION -> ArchiveDomainError.UnsupportedEncryption()
            ZipException.Type.UNKNOWN_COMPRESSION_METHOD -> ArchiveDomainError.UnsupportedCompression(error.message ?: "Unknown ZIP compression method")
            ZipException.Type.FILE_NOT_FOUND -> ArchiveDomainError.EntryNotFound(error.message ?: "ZIP entry not found")
            ZipException.Type.TASK_CANCELLED_EXCEPTION -> ArchiveDomainError.OperationCancelled()
            else -> ArchiveDomainError.InvalidArchive(error.message ?: "Invalid ZIP archive")
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
