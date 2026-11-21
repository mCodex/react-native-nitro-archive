package com.mcodex.nitroarchive.infrastructure.storage

import com.mcodex.nitroarchive.application.ports.ArchiveOutput
import java.io.File
import java.io.FileOutputStream

class LocalFileOutput(private val path: String) : ArchiveOutput {
    private var outputStream: FileOutputStream? = null

    override suspend fun write(data: ByteArray) {
        if (outputStream == null) {
            val file = File(path)
            file.parentFile?.mkdirs()
            outputStream = FileOutputStream(file)
        }
        try {
            outputStream?.write(data)
        } catch (e: Exception) {
            try { outputStream?.close() } catch (_: Exception) {}
            outputStream = null
            throw e
        }
    }

    override suspend fun finalize() {
        try {
            outputStream?.close()
        } finally {
            outputStream = null
        }
    }
}
