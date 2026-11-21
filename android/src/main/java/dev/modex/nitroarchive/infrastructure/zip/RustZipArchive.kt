package dev.modex.nitroarchive.infrastructure.zip

import dev.modex.nitroarchive.application.ports.ArchiveInspection
import dev.modex.nitroarchive.application.ports.EntryDescriptor
import dev.modex.nitroarchive.domain.ArchiveDomainError
import org.json.JSONObject

internal object RustZipArchive {
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

    fun inspect(data: ByteArray): ArchiveInspection {
        val result = parseResponse(inspectBytes(data))

        val metadata = result.getJSONArray("entries")
        val entries = List(metadata.length()) { metadata.getJSONObject(it) }
            .sortedBy { it.getString("rawPath") }
            .mapIndexed { index, entry ->
                EntryDescriptor(
                    index = index,
                    path = entry.getString("rawPath"),
                    kind = entry.getString("kind"),
                    compressedSize = entry.safeByteCount("compressedSize"),
                    uncompressedSize = entry.safeByteCount("uncompressedSize"),
                    encrypted = entry.getBoolean("encrypted"),
                    compressionMethod = entry.getString("compressionMethod"),
                    crc32 = if (entry.isNull("crc32")) null else entry.getLong("crc32").toUInt(),
                    unixMode = if (entry.isNull("unixMode")) null else entry.getInt("unixMode").toUShort()
                )
            }

        return ArchiveInspection(
            format = result.getString("format"),
            entryCount = entries.size,
            entries = entries,
            compressedSize = result.safeByteCount("compressedSize"),
            totalUncompressedSize = result.safeByteCount("totalUncompressedSize"),
            encrypted = result.getBoolean("encrypted"),
            comment = if (result.isNull("comment")) null else result.getString("comment").takeIf(String::isNotEmpty)
        )
    }

    fun read(data: ByteArray, path: String, limit: Long, password: String?): ByteArray {
        if (path.length > 1024 || path.contains('\u0000') || limit < 0) {
            throw ArchiveDomainError.InvalidArgument("Invalid entry path or read limit")
        }
        val encodedPath = path.toByteArray(Charsets.UTF_8)
        if (encodedPath.size > 1024) {
            throw ArchiveDomainError.InvalidArgument("Entry path exceeds the ZIP path limit")
        }
        val terminatedPath = encodedPath.copyOf(encodedPath.size + 1)
        val encodedPassword = password?.toByteArray(Charsets.UTF_8)
        val result = try {
            readBytes(data, terminatedPath, encodedPassword, limit)
        } finally {
            encodedPassword?.fill(0)
        } ?: throw ArchiveDomainError.Internal("Rust ZIP read returned no result")

        result.error?.let(::fail)
        return result.bytes ?: throw ArchiveDomainError.Internal("Rust ZIP read returned no bytes")
    }

    fun detect(data: ByteArray): String? = detectionFormat(parseResponse(detectBytes(data)))

    fun detect(path: String): String? {
        if (path.contains('\u0000')) throw ArchiveDomainError.InvalidArgument("Invalid archive path")
        return detectionFormat(parseResponse(detectPath(terminated(path))))
    }

    fun openDirectoryDescriptor(path: String): Int = openDirectoryPath(terminated(path))

    fun rename(directory: Int, from: String, to: String, exchange: Boolean): Int =
        renameDirectoryEntry(directory, terminated(from), terminated(to), exchange)

    fun operation(request: JSONObject, password: String?, progress: Progress): JSONObject {
        val secret = password?.toByteArray(Charsets.UTF_8)
        val result = try {
            runOperation(terminated(request.toString()), secret, progress)
        } finally {
            secret?.fill(0)
        }
        return parseResponse(result)
    }

    fun interface Progress {
        fun update(bytes: Long, entries: Long): Boolean
    }

    private fun parseResponse(data: ByteArray?): JSONObject {
        if (data == null) throw ArchiveDomainError.Internal("Rust archive operation returned no result")
        val response = JSONObject(data.toString(Charsets.UTF_8))
        if (response.has("error")) fail(response.getString("error"))
        return response
    }

    private fun fail(code: String): Nothing {
        if (code == "E_OPERATION_CANCELLED") throw ArchiveDomainError.OperationCancelled()
        throw ArchiveDomainError.RustFailure(code)
    }

    private fun detectionFormat(result: JSONObject): String? =
        if (result.isNull("format")) null else result.getString("format")

    private fun terminated(value: String): ByteArray =
        value.toByteArray(Charsets.UTF_8).let { it.copyOf(it.size + 1) }

    private fun JSONObject.safeByteCount(key: String): Long {
        val value = when (val number = get(key)) {
            is Int -> number.toLong()
            is Long -> number
            else -> throw ArchiveDomainError.ArchiveTooLarge()
        }

        if (value !in 0L..MAX_SAFE_INTEGER) throw ArchiveDomainError.ArchiveTooLarge()
        return value
    }

    private external fun inspectBytes(data: ByteArray): ByteArray?
    private external fun readBytes(
        data: ByteArray,
        path: ByteArray,
        password: ByteArray?,
        limit: Long
    ): ReadResult?

    private external fun renameDirectoryEntry(directory: Int, from: ByteArray, to: ByteArray, exchange: Boolean): Int
    private external fun openDirectoryPath(path: ByteArray): Int
    private external fun detectBytes(data: ByteArray): ByteArray?
    private external fun detectPath(path: ByteArray): ByteArray?
    private external fun runOperation(request: ByteArray, password: ByteArray?, sink: Progress): ByteArray?

    private class ReadResult(val bytes: ByteArray?, val error: String?)
}
