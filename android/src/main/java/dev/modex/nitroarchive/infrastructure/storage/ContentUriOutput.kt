package com.mcodex.nitroarchive.infrastructure.storage

import android.content.ContentResolver
import android.net.Uri
import com.mcodex.nitroarchive.application.ports.ArchiveOutput

class ContentUriOutput(
    private val contentResolver: ContentResolver,
    private val uri: Uri
) : ArchiveOutput {
    private var outputStream: java.io.OutputStream? = null

    override suspend fun write(data: ByteArray) {
        if (outputStream == null) {
            outputStream = contentResolver.openOutputStream(uri)
                ?: throw com.mcodex.nitroarchive.domain.ArchiveDomainError.FileNotAvailable("Cannot open output: $uri")
        }
        outputStream?.write(data)
    }

    override suspend fun finalize() {
        outputStream?.close()
        outputStream = null
    }
}
