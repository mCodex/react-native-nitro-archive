package dev.modex.nitroarchive.domain

data class ProgressSnapshot(
    val processedBytes: Long,
    val processedEntries: Int,
    val totalEntries: Int,
    val currentEntry: String?
)
