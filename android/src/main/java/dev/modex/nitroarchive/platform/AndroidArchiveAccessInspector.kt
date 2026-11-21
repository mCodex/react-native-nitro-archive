package com.mcodex.nitroarchive.platform

import android.content.Context
import com.mcodex.nitroarchive.application.ports.AccessReport
import com.mcodex.nitroarchive.application.ports.ArchiveAccessInspector
import com.mcodex.nitroarchive.application.ports.ArchiveAccessMode
import java.io.File

class AndroidArchiveAccessInspector(private val context: Context) : ArchiveAccessInspector {

    override fun checkFileAccess(path: String, mode: ArchiveAccessMode): AccessReport {
        val file = File(path)
        return when (mode) {
            ArchiveAccessMode.READ -> {
                val readable = file.canRead()
                AccessReport(
                    accessible = readable,
                    readable = readable,
                    writable = false,
                    reason = if (readable) null else "permission-denied"
                )
            }
            ArchiveAccessMode.WRITE, ArchiveAccessMode.CREATE_CHILDREN -> {
                val writable = file.canWrite() || file.parentFile?.canWrite() == true
                AccessReport(
                    accessible = writable,
                    readable = true,
                    writable = writable,
                    reason = if (writable) null else "permission-denied"
                )
            }
        }
    }

    override fun checkUriAccess(uri: String, mode: ArchiveAccessMode): AccessReport {
        if (!uri.startsWith("content://")) {
            val file = File(uri.removePrefix("file://"))
            return checkFileAccess(file.absolutePath, mode)
        }
        val contentResolver = context.contentResolver
        return try {
            val takeFlags: Int
            val isReadable: Boolean
            val isWritable: Boolean
            when (mode) {
                ArchiveAccessMode.READ -> {
                    takeFlags = android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                    isReadable = true
                    isWritable = false
                }
                ArchiveAccessMode.WRITE -> {
                    takeFlags = android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    isReadable = true
                    isWritable = true
                }
                ArchiveAccessMode.CREATE_CHILDREN -> {
                    takeFlags = android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    isReadable = true
                    isWritable = true
                }
            }
            val uriObj = android.net.Uri.parse(uri)
            contentResolver.takePersistableUriPermission(uriObj, takeFlags)
            AccessReport(
                accessible = true,
                readable = isReadable,
                writable = isWritable,
                reason = null
            )
        } catch (e: SecurityException) {
            AccessReport(
                accessible = false,
                readable = false,
                writable = false,
                reason = "uri-grant-missing"
            )
        }
    }
}
