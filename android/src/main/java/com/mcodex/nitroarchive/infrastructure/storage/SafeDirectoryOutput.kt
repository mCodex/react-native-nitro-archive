package com.mcodex.nitroarchive.infrastructure.storage

import com.mcodex.nitroarchive.application.ports.DirectoryOutput
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import java.io.File

class SafeDirectoryOutput(private val baseDir: File) : DirectoryOutput {
    private val createdPaths = mutableListOf<String>()

    private fun validatePath(path: String) {
        val resolved = File(baseDir, path).canonicalFile
        if (!resolved.path.startsWith(baseDir.canonicalPath)) {
            throw ArchiveDomainError.PathTraversal(path)
        }
    }

    override suspend fun prepareDirectory(at: String) {
        validatePath(at)
        val dir = File(baseDir, at)
        dir.mkdirs()
        createdPaths.add(at)
    }

    override suspend fun createFile(at: String): File {
        validatePath(at)
        val file = File(baseDir, at)
        file.parentFile?.mkdirs()
        file.createNewFile()
        createdPaths.add(at)
        return file
    }

    override suspend fun commit() {
        // For local directory output, commit is a no-op
    }

    override suspend fun rollback() {
        createdPaths.reversed().forEach { path ->
            File(baseDir, path).deleteRecursively()
        }
        createdPaths.clear()
    }
}
