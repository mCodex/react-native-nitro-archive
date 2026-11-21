package dev.modex.nitroarchive.infrastructure.storage

import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructStat
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.ArchivePath
import java.io.File
import dev.modex.nitroarchive.infrastructure.zip.RustZipArchive

internal class SafeDirectoryOutput(baseDir: File) {
    private data class CreatedPath(val file: File, val identity: StructStat, val backup: String? = null)

    private val baseDir = rootedDestination(baseDir)
    private val createdPaths = mutableListOf<CreatedPath>()

    fun prepareDirectory(path: String) {
        withDirectory(destination(path), create = true, onCreated = ::recordDirectory) {}
    }

    fun publish(path: String, source: File, overwrite: String): Boolean {
        val target = destination(path)
        return withDirectory(target.parentFile!!, create = true, onCreated = ::recordDirectory) { directory ->
            var name = target.name
            var existing = fileStatus(File(directory, name))

            when (overwrite) {
                "skip" -> if (existing != null) return@withDirectory false
                "rename" -> {
                    var suffix = 1
                    while (existing != null) {
                        if (suffix > 10_000) throw ArchiveDomainError.DestinationExists(path)
                        val extension = target.extension
                        name = if (extension.isEmpty()) "${target.name}-$suffix"
                            else "${target.nameWithoutExtension}-$suffix.$extension"
                        suffix++
                        existing = fileStatus(File(directory, name))
                    }
                }
                "replace" -> if (existing != null && !OsConstants.S_ISREG(existing.st_mode)) {
                    throw ArchiveDomainError.DestinationExists(path)
                }
                else -> if (existing != null) throw ArchiveDomainError.DestinationExists(path)
            }

            val stage = stageVerifiedFile(directory, source)
            var preserveStage = false
            try {
                val identity = fileStatus(stage) ?: throw ArchiveDomainError.IoError("Verified staging file disappeared")
                val directoryFd = directory.name.toInt()
                val replacing = overwrite == "replace" && existing != null
                val result = RustZipArchive.rename(directoryFd, stage.name, name, exchange = replacing)
                if (result == -OsConstants.EEXIST) throw ArchiveDomainError.DestinationExists(path)
                if (result != 0) throw ErrnoException("publish verified archive file", -result)

                if (replacing) {
                    preserveStage = true
                    val previous = fileStatus(stage)
                    if (previous == null || previous.st_dev != existing!!.st_dev || previous.st_ino != existing.st_ino) {
                        if (RustZipArchive.rename(directoryFd, stage.name, name, exchange = true) == 0) {
                            preserveStage = false
                        }
                        throw ArchiveDomainError.InvalidState("Extraction destination changed before replacement")
                    }
                }

                createdPaths.add(CreatedPath(File(target.parentFile, name), identity, stage.name.takeIf { replacing }))
                true
            } finally {
                if (!preserveStage) stage.delete()
            }
        }
    }

    fun commit() {
        for (created in createdPaths) {
            val backup = created.backup ?: continue
            withDirectory(created.file.parentFile!!, create = false) { File(it, backup).delete() }
        }
        createdPaths.clear()
    }

    fun rollback() {
        var failure: Exception? = null
        for (created in createdPaths.asReversed()) {
            try {
                withDirectory(created.file.parentFile!!, create = false) { directory ->
                    val leaf = File(directory, created.file.name)
                    val actual = fileStatus(leaf) ?: return@withDirectory
                    if (actual.st_dev != created.identity.st_dev || actual.st_ino != created.identity.st_ino) {
                        throw ArchiveDomainError.InvalidState("Extraction output changed before cleanup")
                    }
                    if (created.backup == null) Os.remove(leaf.path)
                    else Os.rename(File(directory, created.backup).path, leaf.path)
                }
            } catch (error: Exception) {
                if (failure == null) failure = error
            }
        }
        createdPaths.clear()
        failure?.let { throw it }
    }

    private fun destination(path: String): File {
        val components = try {
            ArchivePath.fromRaw(path).components
        } catch (_: IllegalArgumentException) {
            throw ArchiveDomainError.PathTraversal(path)
        }
        return components.fold(baseDir) { parent, component -> File(parent, component) }
    }

    private fun recordDirectory(directory: File, status: StructStat) {
        createdPaths.add(CreatedPath(directory, status))
    }
}
