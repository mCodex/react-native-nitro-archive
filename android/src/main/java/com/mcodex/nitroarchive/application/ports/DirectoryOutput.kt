package com.mcodex.nitroarchive.application.ports

import java.io.File

interface DirectoryOutput {
    suspend fun prepareDirectory(at: String)
    suspend fun createFile(at: String): File
    suspend fun commit()
    suspend fun rollback()
}
