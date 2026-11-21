package com.mcodex.nitroarchive.application.ports

enum class ArchiveAccessMode { READ, WRITE, CREATE_CHILDREN }

data class AccessReport(
    val accessible: Boolean,
    val readable: Boolean,
    val writable: Boolean,
    val reason: String? = null
)

interface ArchiveAccessInspector {
    fun checkFileAccess(path: String, mode: ArchiveAccessMode): AccessReport
    fun checkUriAccess(uri: String, mode: ArchiveAccessMode): AccessReport
}
