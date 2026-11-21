package dev.modex.nitroarchive.platform

import java.io.File
import java.util.UUID

class AndroidTemporaryStorage(private val cacheDir: File) {
    private val tempDir: File

    init {
        tempDir = File(cacheDir, "dev.modex.nitroarchive")
        tempDir.mkdirs()
    }

    fun createTemporaryFile(extension: String = ".tmp"): File {
        val id = UUID.randomUUID().toString()
        return File(tempDir, "$id$extension")
    }

    fun cleanAll() {
        tempDir.deleteRecursively()
    }
}
