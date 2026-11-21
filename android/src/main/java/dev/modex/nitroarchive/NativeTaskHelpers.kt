package com.mcodex.nitroarchive

import com.margelo.nitro.archive.NativeProgress

/**
 * Creates an idle [NativeProgress] snapshot for a new task.
 */
internal fun createInitialProgress(operationId: String): NativeProgress = NativeProgress(
    operationId = operationId,
    phase = "idle",
    processedBytes = 0.0,
    totalBytes = null,
    processedEntries = 0.0,
    totalEntries = null,
    currentEntry = null,
    bytesPerSecond = null,
    estimatedSecondsRemaining = null,
    percentage = null
)

/**
 * Builds a [NativeProgress] snapshot and notifies all registered listeners.
 *
 * @return The newly created snapshot so callers can cache it.
 */
internal fun emitProgress(
    operationId: String,
    phase: String,
    processedBytes: Long = 0L,
    totalBytes: Long? = null,
    processedEntries: Double = 0.0,
    totalEntries: Double? = null,
    currentEntry: String? = null,
    listeners: List<(NativeProgress) -> Unit>
): NativeProgress {
    val percentage = when {
        totalBytes != null && totalBytes > 0 ->
            minOf(processedBytes.toDouble() / totalBytes.toDouble() * 100.0, 100.0)
        totalEntries != null && totalEntries > 0 ->
            minOf(processedEntries / totalEntries * 100.0, 100.0)
        else -> null
    }
    val snapshot = NativeProgress(
        operationId = operationId,
        phase = phase,
        processedBytes = processedBytes.toDouble(),
        totalBytes = totalBytes?.toDouble(),
        processedEntries = processedEntries,
        totalEntries = totalEntries,
        currentEntry = currentEntry,
        bytesPerSecond = null,
        estimatedSecondsRemaining = null,
        percentage = percentage
    )
    listeners.forEach { it(snapshot) }
    return snapshot
}

/**
 * Returns `true` when [bytes] starts with the ZIP local file header signature
 * (`PK\x03\x04`).
 */
internal fun isZipSignature(bytes: ByteArray): Boolean = bytes.size >= 4
    && bytes[0] == 0x50.toByte()
    && bytes[1] == 0x4B.toByte()
    && bytes[2] == 0x03.toByte()
    && bytes[3] == 0x04.toByte()

/**
 * Maps a Nitro access-mode string to the domain
 * [com.mcodex.nitroarchive.application.ports.ArchiveAccessMode].
 */
internal fun parseAccessMode(mode: String): com.mcodex.nitroarchive.application.ports.ArchiveAccessMode =
    if (mode == "write" || mode == "create-children") {
        com.mcodex.nitroarchive.application.ports.ArchiveAccessMode.WRITE
    } else {
        com.mcodex.nitroarchive.application.ports.ArchiveAccessMode.READ
    }
