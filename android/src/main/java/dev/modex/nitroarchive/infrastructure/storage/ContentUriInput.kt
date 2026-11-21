package dev.modex.nitroarchive.infrastructure.storage

import android.content.ContentResolver
import android.net.Uri
import dev.modex.nitroarchive.application.ports.ArchiveInput
import dev.modex.nitroarchive.platform.ParcelFileDescriptorHandle

class ContentUriInput(
    private val contentResolver: ContentResolver,
    private val uri: Uri
) : ArchiveInput {

    override val estimatedSize: Long?
        get() = try {
            ParcelFileDescriptorHandle.open(contentResolver, uri, "r").use { it.size }
        } catch (e: Exception) { null }

    override suspend fun openForRandomAccess(): ByteArray {
        val handle = ParcelFileDescriptorHandle.open(contentResolver, uri, "r")
        return handle.use { pfd ->
            val fd = pfd.fileDescriptor
            val inputStream = java.io.FileInputStream(fd)
            inputStream.use { it.readBytes() }
        }
    }
}
