package com.mcodex.nitroarchive.infrastructure.storage

import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructStat
import com.mcodex.nitroarchive.application.ports.DirectoryOutput
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.ArchivePath
import java.io.File

class SafeDirectoryOutput(baseDir: File) : DirectoryOutput {
    // shortcut: engines reopen paths; descriptor-relative writes are needed to resist concurrent destination replacement.
    private data class CreatedPath(val file: File, val device: Long, val inode: Long)

    private val baseDir = baseDir.absoluteFile.normalize().let { directory ->
        directory.parentFile?.let { File(it.canonicalFile, directory.name) } ?: directory
    }
    private val createdPaths = mutableListOf<CreatedPath>()

    override suspend fun prepareDirectory(at: String) {
        prepareParents(pathComponents(at))
    }

    override suspend fun createFile(at: String): File {
        val components = pathComponents(at)
        prepareParents(components.dropLast(1))
        val file = components.fold(baseDir) { parent, component -> File(parent, component) }

        fileStatus(file)?.let { status ->
            rejectSymlink(status, file)
            throw ArchiveDomainError.DestinationExists(at)
        }

        try {
            val descriptor = Os.open(file.path,
                OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_WRONLY or OsConstants.O_NOFOLLOW,
                OsConstants.S_IRUSR or OsConstants.S_IWUSR)
            val status = try {
                Os.fstat(descriptor)
            } finally {
                Os.close(descriptor)
            }
            createdPaths.add(CreatedPath(file, status.st_dev, status.st_ino))
        } catch (error: ErrnoException) {
            throw ioError(file, error)
        }

        return file
    }

    override suspend fun commit() {
        createdPaths.clear()
    }

    override suspend fun rollback() {
        var firstFailure: Exception? = null
        val remaining = mutableListOf<CreatedPath>()

        for (created in createdPaths.asReversed()) {
            try {
                validateParents(created.file)
                val status = fileStatus(created.file) ?: continue
                if (status.st_dev != created.device || status.st_ino != created.inode) {
                    throw ArchiveDomainError.InvalidState("Extraction output changed before cleanup")
                }

                // Never recursively remove a directory: it may contain another operation's files.
                Os.remove(created.file.path)
            } catch (error: Exception) {
                if (firstFailure == null) firstFailure = error
                remaining.add(created)
            }
        }

        createdPaths.clear()
        createdPaths.addAll(remaining.asReversed())
        firstFailure?.let { throw it }
    }

    private fun pathComponents(path: String): List<String> {
        if (path.contains('\\')) throw ArchiveDomainError.PathTraversal(path)

        return try {
            ArchivePath.fromRaw(path).components
        } catch (error: IllegalArgumentException) {
            throw ArchiveDomainError.PathTraversal(path)
        }
    }

    private fun prepareParents(components: List<String>) {
        ensureDirectory(baseDir)
        var directory = baseDir

        for (component in components) {
            directory = File(directory, component)
            ensureDirectory(directory)
        }
    }

    private fun ensureDirectory(directory: File) {
        fileStatus(directory)?.let { status ->
            rejectSymlink(status, directory)
            if (!OsConstants.S_ISDIR(status.st_mode)) throw ArchiveDomainError.DestinationExists(directory.path)
            return
        }

        directory.parentFile?.let { ensureDirectory(it) }
            ?: throw ArchiveDomainError.IoError("Missing filesystem root")

        try {
            Os.mkdir(directory.path, OsConstants.S_IRWXU)
        } catch (error: ErrnoException) {
            if (error.errno == OsConstants.EEXIST) return ensureDirectory(directory)
            throw ioError(directory, error)
        }
        val status = fileStatus(directory) ?: throw ArchiveDomainError.IoError("Created directory disappeared")
        createdPaths.add(CreatedPath(directory, status.st_dev, status.st_ino))
    }

    private fun validateParents(file: File) {
        if (!file.path.startsWith(baseDir.path + File.separator)) return
        var parent = file.parentFile

        while (parent != null && parent != baseDir.parentFile) {
            val status = fileStatus(parent) ?: return
            rejectSymlink(status, parent)
            parent = parent.parentFile
        }
    }

    private fun fileStatus(file: File): StructStat? = try {
        Os.lstat(file.path)
    } catch (error: ErrnoException) {
        if (error.errno == OsConstants.ENOENT) null else throw ioError(file, error)
    }

    private fun rejectSymlink(status: StructStat, file: File) {
        if (OsConstants.S_ISLNK(status.st_mode)) throw ArchiveDomainError.UnsafeSymlink(file.path)
    }

    private fun ioError(file: File, error: ErrnoException) =
        ArchiveDomainError.IoError("Filesystem operation failed for ${file.name}: errno ${error.errno}")
}
