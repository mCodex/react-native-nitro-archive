package com.mcodex.nitroarchive.domain

data class ProgressSnapshot(
    val operationId: String,
    val phase: String = "preparing",
    val processedBytes: Long = 0,
    val totalBytes: Long? = null,
    val processedEntries: Int = 0,
    val totalEntries: Int? = null,
    val currentEntry: String? = null,
    val bytesPerSecond: Double? = null,
    val estimatedSecondsRemaining: Double? = null
) {
    val percentage: Double?
        get() {
            if (totalBytes != null && totalBytes > 0) {
                return minOf(processedBytes.toDouble() / totalBytes.toDouble() * 100.0, 100.0)
            }
            if (totalEntries != null && totalEntries > 0) {
                return minOf(processedEntries.toDouble() / totalEntries.toDouble() * 100.0, 100.0)
            }
            return null
        }
}
