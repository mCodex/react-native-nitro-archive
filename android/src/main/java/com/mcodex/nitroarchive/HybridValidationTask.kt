package com.mcodex.nitroarchive

import com.margelo.nitro.archive.*
import com.margelo.nitro.core.Promise
import com.mcodex.nitroarchive.application.ports.ArchiveEngine
import com.mcodex.nitroarchive.application.ports.ArchiveEngineSession
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.TaskState
import com.mcodex.nitroarchive.domain.TaskStateMachine
import java.util.UUID
import java.util.zip.CRC32

class HybridValidationTask(
    private val session: ArchiveEngineSession,
    private val engine: ArchiveEngine,
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
                        val data = engine.readEntry(
                            session = session,
                            path = entry.path,
                            limit = entry.uncompressedSize.coerceAtLeast(1),
                            password = request.password
                        )

                        if (verifyChecksums && entry.crc32 != null && data.isNotEmpty()) {
                            val actualCrc = crc32(data)
                            if (actualCrc != entry.crc32) {
                                issues.add(NativeArchiveIssue(
                                    code = "E_CHECKSUM_MISMATCH",
                                    severity = "error",
                                    message = "CRC mismatch for entry: ${entry.path}",
                                    entryPath = entry.path,
                                    entryIndex = entry.index.toDouble()
                                ))
                            }
                        }
                    } catch (e: ArchiveDomainError.ChecksumMismatch) {
                        issues.add(NativeArchiveIssue(
                            code = "E_CHECKSUM_MISMATCH",
                            severity = "error",
                            message = e.message ?: "CRC mismatch",
                            entryPath = entry.path,
                            entryIndex = entry.index.toDouble()
                        ))
                    } catch (e: ArchiveDomainError.BadPassword) {
                        issues.add(NativeArchiveIssue(
                            code = e.code,
                            severity = "error",
                            message = e.message ?: "Incorrect password",
                            entryPath = entry.path,
                            entryIndex = entry.index.toDouble()
                        ))
                    } catch (e: ArchiveDomainError.UnsupportedEncryption) {
                        issues.add(NativeArchiveIssue(
                            code = e.code,
                            severity = "error",
                            message = e.message ?: "Unsupported encryption",
                            entryPath = entry.path,
                            entryIndex = entry.index.toDouble()
                        ))
                    } catch (e: ArchiveDomainError.OperationCancelled) {
                        throw e
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

            stateMachine.succeed()

            NativeValidationResult(
                operationId = operationId,
                valid = issues.isEmpty(),
                checkedEntries = entriesToValidate.size.toDouble(),
                checkedUncompressedBytes = checkedUncompressed.toDouble(),
                encryptedEntries = encryptedCount.toDouble(),
                durationMs = (System.currentTimeMillis() - startTime).toDouble(),
                issues = issues.toTypedArray()
            )
        } catch (e: ArchiveDomainError.OperationCancelled) {
            stateMachine.markCancelled()
            throw e
        } catch (e: ArchiveDomainError) {
            stateMachine.fail()
            throw e
        } catch (e: Exception) {
            stateMachine.fail()
            throw e
        }
    }

    override fun cancel(): Boolean = stateMachine.cancel()

    override fun onProgress(callback: (progress: NativeProgress) -> Unit): () -> Unit {
        listeners.add(callback)
        return { listeners.remove(callback) }
    }

    companion object {
        fun crc32(data: ByteArray): UInt {
            val crc = CRC32()
            crc.update(data)
            return crc.value.toUInt()
        }
    }
}
