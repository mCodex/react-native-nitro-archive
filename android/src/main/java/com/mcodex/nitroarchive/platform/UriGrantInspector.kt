package com.mcodex.nitroarchive.platform

import android.content.Context
import android.net.Uri

class UriGrantInspector(private val context: Context) {

    fun checkReadGrant(uri: Uri): Boolean {
        return try {
            context.contentResolver.takePersistableUriPermission(
                uri,
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            true
        } catch (e: SecurityException) {
            false
        }
    }

    fun checkWriteGrant(uri: Uri): Boolean {
        return try {
            context.contentResolver.takePersistableUriPermission(
                uri,
                android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
            true
        } catch (e: SecurityException) {
            false
        }
    }
}
