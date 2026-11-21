package dev.modex.nitroarchive.infrastructure.storage

import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructStat
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.infrastructure.zip.RustZipArchive
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.UUID

internal inline fun <T> withArchiveStage(cache: File, action: (File) -> T): T {
    val directory = File(cache, "nitro-archive-${UUID.randomUUID()}")
    if (!directory.mkdir()) throw ArchiveDomainError.IoError("Cannot create private archive staging directory")
    try {
        return action(directory)
    } finally {
        directory.deleteRecursively()
    }
}

internal fun InputStream.copyBoundedTo(
    destination: File,
    limit: Long = MAX_ARCHIVE_INPUT_BYTES.toLong(),
    isCancelled: () -> Boolean
): Long {
    var total = 0L
    destination.outputStream().use { output ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            if (isCancelled()) throw ArchiveDomainError.OperationCancelled()
            val count = read(buffer)
            if (count < 0) break
            total += count
            if (total > limit) throw ArchiveDomainError.ArchiveTooLarge()
            output.write(buffer, 0, count)
        }
    }
    return total
}

internal inline fun <T> File.withWriteDescriptor(action: (Int) -> T): T =
    ParcelFileDescriptor.open(
        this, ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or ParcelFileDescriptor.MODE_READ_WRITE
    ).use { action(it.fd) }

internal fun rootedDestination(file: File): File =
    file.absoluteFile.normalize().let { target ->
        target.parentFile?.let { File(it.canonicalFile, target.name) } ?: target
    }

internal inline fun <T> withDirectory(
    absolute: File,
    create: Boolean,
    onCreated: (File, StructStat) -> Unit = { _, _ -> },
    action: (File) -> T
): T {
    openDirectoryDescriptor("/").let { root ->
        var current = root
        var visiblePath = File("/")
        try {
            for (component in absolute.path.split('/').filter(String::isNotEmpty)) {
                val anchor = File("/proc/self/fd/${current.fd}", component)
                visiblePath = File(visiblePath, component)
                var created = false
                if (create && fileStatus(anchor) == null) {
                    try {
                        Os.mkdir(anchor.path, OsConstants.S_IRWXU)
                        created = true
                    } catch (error: ErrnoException) {
                        if (error.errno != OsConstants.EEXIST) throw error
                    }
                }
                val next = openDirectoryDescriptor(anchor.path)
                current.close()
                current = next
                if (created) onCreated(visiblePath, Os.fstat(current.fileDescriptor))
            }
            return action(File("/proc/self/fd/${current.fd}"))
        } finally {
            current.close()
        }
    }
}

internal fun openDirectoryDescriptor(path: String): ParcelFileDescriptor {
    val descriptor = RustZipArchive.openDirectoryDescriptor(path)
    if (descriptor < 0) {
        if (-descriptor == OsConstants.ELOOP || -descriptor == OsConstants.ENOTDIR) {
            throw ArchiveDomainError.UnsafeSymlink("Destination parent is not a plain directory")
        }
        throw ErrnoException("open destination directory", -descriptor)
    }
    return ParcelFileDescriptor.adoptFd(descriptor)
}

internal fun fileStatus(file: File): StructStat? = try {
    Os.lstat(file.path)
} catch (error: ErrnoException) {
    if (error.errno == OsConstants.ENOENT) null else throw error
}

internal fun stageVerifiedFile(directory: File, source: File): File {
    val stage = File(directory, ".nitro-stage-${UUID.randomUUID()}")
    val descriptor = Os.open(
        stage.path,
        OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_NOFOLLOW or OsConstants.O_WRONLY,
        OsConstants.S_IRUSR or OsConstants.S_IWUSR
    )
    try {
        FileOutputStream(descriptor).use { output ->
            source.inputStream().use { it.copyTo(output) }
            output.fd.sync()
        }
        return stage
    } catch (error: Exception) {
        stage.delete()
        throw error
    } finally {
        if (descriptor.valid()) Os.close(descriptor)
    }
}
