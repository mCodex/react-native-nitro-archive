package dev.modex.nitroarchive

import com.margelo.nitro.archive.*
import com.margelo.nitro.core.Promise
import dev.modex.nitroarchive.application.ExtractionPlanner
import dev.modex.nitroarchive.application.ports.ArchiveInspection
import dev.modex.nitroarchive.application.ports.ArchiveEngineSession
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.TaskState
import dev.modex.nitroarchive.domain.TaskStateMachine
import dev.modex.nitroarchive.infrastructure.zip.RustZipArchive
import java.util.UUID

class HybridValidationTask(
    private val session: ArchiveEngineSession,
    private val inspection: ArchiveInspection,
    private val request: NativeValidationRequest
) : HybridNativeValidationTaskSpec() {

    private val stateMachine = TaskStateMachine()
    private val operationId = UUID.randomUUID().toString()
    private val listeners = java.util.concurrent.CopyOnWriteArrayList<(NativeProgress) -> Unit>()
    private var latestProgress = createInitialProgress(operationId)

    override val state: String get() = stateMachine.state.name.lowercase()
    override val progress: NativeProgress get() = latestProgress

    override fun start(): Promise<NativeValidationResult> = Promise.async {
        stateMachine.start()
        val startTime = System.currentTimeMillis()
        try {
            latestProgress = emitProgress(operationId, phase = "validating", listeners = listeners)

            val entries = session.entries
            val limits = archiveLimits(request.limits)
            checkCompressionRatio(inspection, limits)
            val checkedEntries = if (inspection.format == "tar.gz")
                entries.map { it.copy(compressedSize = it.uncompressedSize) } else entries
            ExtractionPlanner().plan(checkedEntries, null, null, limits)
            val issues = mutableListOf<NativeArchiveIssue>()
            var checkedUncompressed = 0L
            var encryptedCount = 0
            val verifyChecksums = request.verifyChecksums ?: true
            val scanAll = request.scanAllEntries ?: true
            val maxChecksumBytes = 64L * 1024L * 1024L
            val entriesToValidate = if (scanAll) entries else entries.filter { it.encrypted }

            latestProgress = emitProgress(
                operationId = operationId,
                phase = "validating",
                totalEntries = entriesToValidate.size.toDouble(),
                listeners = listeners
            )

            for ((i, entry) in entriesToValidate.withIndex()) {
                if (stateMachine.state == TaskState.CANCELLING) {
                    throw ArchiveDomainError.OperationCancelled()
                }

                if (entry.encrypted) {
                    encryptedCount++
                }

                checkedUncompressed += entry.uncompressedSize

                latestProgress = emitProgress(
                    operationId = operationId,
                    phase = "validating",
                    processedEntries = i.toDouble(),
                    totalEntries = entriesToValidate.size.toDouble(),
                    currentEntry = entry.path,
                    listeners = listeners
                )

                if (entry.kind == "file" && (verifyChecksums || scanAll)) {
                    if (entry.encrypted && request.password.isNullOrEmpty()) {
                        issues.add(NativeArchiveIssue(
                            code = "E_PASSWORD_REQUIRED",
                            severity = "error",
                            message = "Password is required to validate encrypted entry: ${entry.path}",
                            entryPath = entry.path,
                            entryIndex = entry.index.toDouble()
                        ))
                        continue
                    }
                    if (entry.uncompressedSize > maxChecksumBytes) {
                        issues.add(NativeArchiveIssue(
                            code = "E_ARCHIVE_TOO_LARGE",
                            severity = "warning",
                            message = "Checksum validation skipped for large entry: ${entry.path}",
                            entryPath = entry.path,
                            entryIndex = entry.index.toDouble()
                        ))
                        continue
                    }
                    try {
                        RustZipArchive.read(
                            data = session.archiveData,
                            path = entry.path,
                            limit = entry.uncompressedSize.coerceAtLeast(1),
                            password = request.password
                        )
                    } catch (e: ArchiveDomainError.OperationCancelled) {
                        throw e
                    } catch (e: ArchiveDomainError) {
                        issues.add(NativeArchiveIssue(
                            code = e.code,
                            severity = "error",
                            message = e.message ?: e.code,
                            entryPath = entry.path,
                            entryIndex = entry.index.toDouble()
                        ))
                    } catch (e: Exception) {
                        if (scanAll) {
                            issues.add(NativeArchiveIssue(
                                code = "E_IO",
                                severity = "error",
                                message = "Failed to read entry '${entry.path}': ${e.message}",
                                entryPath = entry.path,
                                entryIndex = entry.index.toDouble()
                            ))
                        } else {
                            throw e
                        }
                    }
                }
            }

            latestProgress = emitProgress(
                operationId = operationId,
                phase = "finalizing",
                processedEntries = entriesToValidate.size.toDouble(),
                totalEntries = entriesToValidate.size.toDouble(),
                listeners = listeners
            )

            stateMachine.beginCommit()
            stateMachine.succeed()

            NativeValidationResult(
                operationId = operationId,
                valid = issues.isEmpty(),
                checkedEntries = entriesToValidate.size.toDouble(),
                checkedUncompressedBytes = checkedUncompressed.toDouble(),
                encryptedEntries = encryptedCount.toDouble(),
                durationMs = (System.currentTimeMillis() - startTime).toDouble(),
                issues = issues.toTypedArray(),
                error = null
            )
        } catch (error: Exception) {
            val domain = archiveDomainFailure(error)
            if (domain is ArchiveDomainError.OperationCancelled) stateMachine.markCancelled() else stateMachine.fail()
            if (domain == null) throw error
            NativeValidationResult(
                operationId, false, 0.0, 0.0, 0.0, (System.currentTimeMillis() - startTime).toDouble(),
                emptyArray(), archiveFailure(domain, operationId)
            )
        }
    }

    override fun cancel(): Boolean = stateMachine.cancel()

    override fun onProgress(callback: (progress: NativeProgress) -> Unit): () -> Unit {
        listeners.add(callback)
        return { listeners.remove(callback) }
    }
}
