package com.mcodex.nitroarchive.infrastructure.storage

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import com.mcodex.nitroarchive.application.ports.DirectoryOutput
import java.io.File

class DocumentTreeOutput(
    private val contentResolver: ContentResolver,
    private val treeUri: Uri
) : DirectoryOutput {
    private val createdDocumentIds = mutableListOf<String>()

    override suspend fun prepareDirectory(at: String) {
        var parentUri = treeUri
        val parts = at.split("/")
        for (part in parts) {
            if (part.isEmpty()) continue
            val childUri = DocumentsContract.buildDocumentUriUsingTree(
                parentUri,
                DocumentsContract.getDocumentId(parentUri) + "/" + part
            )
            val result = DocumentsContract.createDocument(contentResolver, parentUri, DocumentsContract.Document.MIME_TYPE_DIR, part)
            if (result != null) {
                createdDocumentIds.add(result.toString())
                parentUri = result
            } else {
                parentUri = childUri
            }
        }
    }

    override suspend fun createFile(at: String): File {
        throw UnsupportedOperationException("DocumentTreeOutput does not support File-based access")
    }

    override suspend fun commit() {
        // No-op for document trees
    }

    override suspend fun rollback() {
        createdDocumentIds.reversed().forEach { docId ->
            try {
                DocumentsContract.deleteDocument(contentResolver, Uri.parse(docId))
            } catch (_: Exception) { }
        }
        createdDocumentIds.clear()
    }
}
