package dev.modex.nitroarchive.infrastructure.storage

import dev.modex.nitroarchive.domain.ArchiveDomainError
import java.io.InputStream

internal const val MAX_ARCHIVE_INPUT_BYTES = 512 * 1024 * 1024

// shortcut: legacy payload readers retain the snapshot in memory, move to a seekable session with the Rust payload reader.
internal fun InputStream.readArchiveBytes(initialBytes: Int = 64 * 1024): ByteArray {
    var data = ByteArray(initialBytes)
    var length = 0
    while (true) {
        if (length == data.size) {
            val next = read()
            if (next < 0) return data
            if (length == MAX_ARCHIVE_INPUT_BYTES) throw ArchiveDomainError.ArchiveTooLarge()

            data = data.copyOf((data.size * 2).coerceIn(1, MAX_ARCHIVE_INPUT_BYTES))
            data[length++] = next.toByte()
            continue
        }

        val read = read(data, length, data.size - length)
        if (read < 0) return data.copyOf(length)
        length += read
    }
}
