package dev.modex.nitroarchive.infrastructure.zip

import dev.modex.nitroarchive.application.ports.ArchiveInspection
import dev.modex.nitroarchive.application.ports.EntryDescriptor
import dev.modex.nitroarchive.domain.ArchiveDomainError
import org.json.JSONObject

internal object RustZipArchive {
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

    fun inspect(data: ByteArray): ArchiveInspection {
        val encoded = inspectBytes(data)
            ?: throw ArchiveDomainError.Internal("Rust ZIP inspection returned no result")
        val result = JSONObject(encoded.toString(Charsets.UTF_8))
        if (result.has("error")) {
            throw ArchiveDomainError.RustFailure(result.getString("error"))
        }

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
                    crc32 = entry.getLong("crc32").toUInt(),
                    unixMode = if (entry.isNull("unixMode")) null else entry.getInt("unixMode").toUShort()
                )
            }

        return ArchiveInspection(
            format = "zip",
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

        result.error?.let { throw ArchiveDomainError.RustFailure(it) }
        return result.bytes ?: throw ArchiveDomainError.Internal("Rust ZIP read returned no bytes")
    }

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

    private class ReadResult(val bytes: ByteArray?, val error: String?)
}
