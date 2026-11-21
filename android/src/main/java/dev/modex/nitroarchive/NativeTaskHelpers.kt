package dev.modex.nitroarchive

import android.system.ErrnoException
import com.margelo.nitro.archive.ArchiveErrorCode
import com.margelo.nitro.archive.NativeArchiveFailure
import com.margelo.nitro.archive.NativeExtractionLimits
import com.margelo.nitro.archive.NativeProgress
import dev.modex.nitroarchive.application.ports.ArchiveInspection
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.ExtractionLimits
import java.io.IOException

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

internal fun archiveFailure(
    error: ArchiveDomainError,
    operationId: String? = null,
    source: String? = null
): NativeArchiveFailure {
    val code = ArchiveErrorCode.entries.find { it.name == error.code } ?: ArchiveErrorCode.E_INTERNAL
    return NativeArchiveFailure(code, error.message ?: error.code, operationId, null, source, null, null)
}

internal fun archiveDomainFailure(error: Exception): ArchiveDomainError? = when (error) {
    is ArchiveDomainError -> error
    is SecurityException -> ArchiveDomainError.PermissionDenied("Archive source or destination is unavailable")
    is IOException, is ErrnoException -> ArchiveDomainError.IoError("Cannot access archive source or destination")
    else -> null
}

internal fun archiveLimits(limits: NativeExtractionLimits?): ExtractionLimits = ExtractionLimits(
    maxEntries = limits?.maxEntries?.toInt() ?: 10_000,
    maxTotalUncompressedBytes = limits?.maxTotalUncompressedBytes?.toLong() ?: 2_147_483_648L,
    maxEntryUncompressedBytes = limits?.maxEntryUncompressedBytes?.toLong() ?: 536_870_912L,
    maxCompressionRatio = limits?.maxCompressionRatio?.toInt() ?: 1000,
    maxPathDepth = limits?.maxPathDepth?.toInt() ?: 32,
    maxPathBytes = limits?.maxPathBytes?.toInt() ?: 1024
)

internal fun checkCompressionRatio(inspection: ArchiveInspection, limits: ExtractionLimits) {
    if (inspection.format != "tar.gz") return
    val compressed = inspection.compressedSize ?: return
    val expanded = inspection.totalUncompressedSize ?: return
    if (compressed > 0 && expanded.toDouble() / compressed > limits.maxCompressionRatio) {
        throw ArchiveDomainError.ExtractionLimitExceeded("maxCompressionRatio", "${expanded / compressed}")
    }
}

/**
 * Maps a Nitro access-mode string to the domain
 * [dev.modex.nitroarchive.application.ports.ArchiveAccessMode].
 */
internal fun parseAccessMode(mode: String): dev.modex.nitroarchive.application.ports.ArchiveAccessMode =
    if (mode == "write" || mode == "create-children") {
        dev.modex.nitroarchive.application.ports.ArchiveAccessMode.WRITE
    } else {
        dev.modex.nitroarchive.application.ports.ArchiveAccessMode.READ
    }
