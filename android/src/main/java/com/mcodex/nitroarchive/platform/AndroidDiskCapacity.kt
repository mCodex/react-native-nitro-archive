package com.mcodex.nitroarchive.platform

import android.os.StatFs
import java.io.File

object AndroidDiskCapacity {
    fun freeBytes(path: String): Long? {
        return try {
            val stat = StatFs(path)
            stat.availableBlocksLong * stat.blockSizeLong
        } catch (e: Exception) {
            null
        }
    }

    fun freeBytes(file: File): Long? = freeBytes(file.absolutePath)
}
