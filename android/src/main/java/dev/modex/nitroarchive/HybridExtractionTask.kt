package dev.modex.nitroarchive

import android.os.SystemClock
import com.margelo.nitro.archive.*
import com.margelo.nitro.core.Promise
import dev.modex.nitroarchive.application.ExtractionPlanner
import dev.modex.nitroarchive.application.ports.ArchiveEngineSession
import dev.modex.nitroarchive.application.ports.ArchiveInspection
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.TaskState
import dev.modex.nitroarchive.domain.TaskStateMachine
import dev.modex.nitroarchive.infrastructure.storage.SafeDirectoryOutput
import dev.modex.nitroarchive.infrastructure.storage.copyBoundedTo
import dev.modex.nitroarchive.infrastructure.storage.withArchiveStage
import dev.modex.nitroarchive.infrastructure.storage.withWriteDescriptor
import dev.modex.nitroarchive.infrastructure.zip.RustZipArchive
import java.io.File
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import org.json.JSONObject

class HybridExtractionTask(
    private val cacheDirectory: File,
    private val session: ArchiveEngineSession,
    private val inspection: ArchiveInspection,
    private val request: NativeExtractionRequest
) : HybridNativeExtractionTaskSpec() {
    private val stateMachine = TaskStateMachine()
    private val operationId = UUID.randomUUID().toString()
    private val listeners = CopyOnWriteArrayList<(NativeProgress) -> Unit>()
    private var latestProgress = createInitialProgress(operationId)

    override val state: String get() = stateMachine.state.name.lowercase()
    override val progress: NativeProgress get() = latestProgress

    override fun start(): Promise<NativeExtractionResult> = Promise.async {
        stateMachine.start()
        val startedAt = SystemClock.elapsedRealtime()
        var destination: SafeDirectoryOutput? = null
        try {
            latestProgress = emitProgress(operationId, "preparing", listeners = listeners)
            val path = request.destinationPath?.takeIf { request.destinationKind == "directory" }
                ?: throw ArchiveDomainError.InvalidArgument("A local extraction destination is required")
            val limits = archiveLimits(request.limits)
            checkCompressionRatio(inspection, limits)
            val descriptors = request.entries?.distinct()?.map {
                session.entry(it) ?: throw ArchiveDomainError.EntryNotFound(it)
            } ?: session.entries
            val plan = ExtractionPlanner().plan(
                if (inspection.format == "tar.gz") descriptors.map { it.copy(compressedSize = it.uncompressedSize) }
                else descriptors,
                request.include?.toList(), request.exclude?.toList(), limits
            )
            for (entry in plan.entries) {
                when (entry.kind) {
                    "symlink" -> throw ArchiveDomainError.UnsafeSymlink(entry.path)
                    "file", "directory" -> Unit
                    else -> throw ArchiveDomainError.SpecialFile(entry.path)
                }
            }
            val output = SafeDirectoryOutput(File(path))
            destination = output

            var extracted = 0
            var skipped = 0
            var written = 0L
            latestProgress = emitProgress(
                operationId, "extracting", totalEntries = plan.totalEntries.toDouble(),
                totalBytes = plan.totalUncompressedBytes, listeners = listeners
            )
            if (plan.entries.isNotEmpty()) withArchiveStage(cacheDirectory) { staging ->
                val archive = File(staging, "archive")
                session.archiveData.inputStream().use { it.copyBoundedTo(archive, isCancelled = ::isCancelled) }
                val file = File(staging, "entry")
                var lastProgressAt = SystemClock.elapsedRealtime()
                for ((index, entry) in plan.entries.withIndex()) {
                    checkCancellation()
                    if (entry.kind == "directory") {
                        output.prepareDirectory(entry.path)
                        extracted++
                        continue
                    }
                    val result = file.withWriteDescriptor { fd ->
                        val params = JSONObject()
                            .put("operation", "extract")
                            .put("archivePath", archive.absolutePath)
                            .put("entryPath", entry.path)
                            .put("outputFd", fd)
                            .put("limit", minOf(limits.maxEntryUncompressedBytes, limits.maxTotalUncompressedBytes - written))
                        RustZipArchive.operation(params, request.password) { bytes, _ ->
                            val now = SystemClock.elapsedRealtime()
                            if (now - lastProgressAt >= (request.progressIntervalMs?.toLong() ?: 100L)) {
                                lastProgressAt = now
                                latestProgress = emitProgress(
                                    operationId, "extracting", processedBytes = written + bytes,
                                    totalBytes = plan.totalUncompressedBytes, processedEntries = index.toDouble(),
                                    totalEntries = plan.totalEntries.toDouble(), currentEntry = entry.path, listeners = listeners
                                )
                            }
                            isCancelled()
                        }
                    }
                    checkCancellation()
                    if (output.publish(entry.path, file, request.overwrite ?: "error")) {
                        written += result.getLong("writtenBytes")
                        extracted++
                    } else {
                        skipped++
                    }
                }
            }

            latestProgress = emitProgress(
                operationId, "finalizing", processedBytes = written, processedEntries = plan.totalEntries.toDouble(),
                totalEntries = plan.totalEntries.toDouble(), listeners = listeners
            )
            stateMachine.beginCommit()
            output.commit()
            stateMachine.succeed()
            NativeExtractionResult(
                operationId, extracted.toDouble(), skipped.toDouble(), written.toDouble(),
                (SystemClock.elapsedRealtime() - startedAt).toDouble(), false, emptyArray(), null
            )
        } catch (error: Exception) {
            val cancelled = error is ArchiveDomainError.OperationCancelled
            val cleanup = if (cancelled) request.cleanupOnCancel != false else request.cleanupOnError != false
            runCatching {
                if (cleanup) destination?.rollback() else destination?.commit()
            }.exceptionOrNull()?.let(error::addSuppressed)
            if (cancelled) stateMachine.markCancelled() else stateMachine.fail()
            val domain = archiveDomainFailure(error) ?: throw error
            NativeExtractionResult(
                operationId, 0.0, 0.0, 0.0, (SystemClock.elapsedRealtime() - startedAt).toDouble(),
                false, emptyArray(), archiveFailure(domain, operationId)
            )
        }
    }

    override fun cancel(): Boolean = stateMachine.cancel()

    override fun onProgress(callback: (progress: NativeProgress) -> Unit): () -> Unit {
        listeners.add(callback)
        return { listeners.remove(callback) }
    }

    private fun isCancelled(): Boolean = stateMachine.state == TaskState.CANCELLING

    private fun checkCancellation() {
        if (isCancelled()) throw ArchiveDomainError.OperationCancelled()
    }
}
