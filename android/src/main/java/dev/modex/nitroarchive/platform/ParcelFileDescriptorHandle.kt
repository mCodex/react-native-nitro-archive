package com.mcodex.nitroarchive.platform

import android.content.ContentResolver
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor

class ParcelFileDescriptorHandle(
    private val pfd: ParcelFileDescriptor
) : AutoCloseable {
    val fd: ParcelFileDescriptor get() = pfd
    val fileDescriptor: java.io.FileDescriptor get() = pfd.fileDescriptor

    val size: Long get() = pfd.statSize

    val isSeekable: Boolean
        get() = pfd.statSize >= 0

    override fun close() {
        pfd.close()
    }

    companion object {
        fun open(contentResolver: ContentResolver, uri: Uri, mode: String): ParcelFileDescriptorHandle {
            val pfd = contentResolver.openFileDescriptor(uri, mode)
                ?: throw com.mcodex.nitroarchive.domain.ArchiveDomainError.FileNotAvailable("Cannot open: $uri")
            return ParcelFileDescriptorHandle(pfd)
        }
    }
}
