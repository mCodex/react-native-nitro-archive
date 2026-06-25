package com.mcodex.nitroarchive

import com.margelo.nitro.archive.*
import com.margelo.nitro.core.Promise
import com.mcodex.nitroarchive.application.CreateArchiveUseCase
import com.mcodex.nitroarchive.application.ports.*
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.TaskStateMachine
import com.mcodex.nitroarchive.infrastructure.storage.LocalFileOutput
import java.util.UUID

class HybridCreationTask(
    private val engine: ArchiveEngine,
    private val request: NativeCreationRequest
) : HybridNativeCreationTaskSpec() {

    private val stateMachine = TaskStateMachine()
    private val operationId = UUID.randomUUID().toString()
    private val listeners = mutableListOf<(NativeProgress) -> Unit>()
    private var latestProgress = NativeProgress(
        operationId = operationId,
        phase = "idle",
        processedBytes = 0L,
        totalBytes = null,
        processedEntries = 0.0,
        totalEntries = null,
        currentEntry = null,
        bytesPerSecond = null,
        estimatedSecondsRemaining = null,
        percentage = null
    )

    override val state: String get() = stateMachine.state.name.lowercase()
    override val progress: NativeProgress get() = latestProgress

    override fun start(): Promise<NativeCreationResult> = Promise.async {
        stateMachine.start()
        val startTime = System.currentTimeMillis()
        try {
            emitProgress(phase = "preparing")

            val destinationPath = when (request.destinationKind) {
                "file" -> request.destinationPath
                    ?: throw ArchiveDomainError.InvalidArgument("destinationPath required for file creation")
                else -> throw ArchiveDomainError.InvalidArgument("Unsupported destination kind: ${request.destinationKind}")
            }

            val entryInputs = request.entries.map { nativeEntry ->
                val data = nativeEntry.data?.let { arrayBuffer ->
                    arrayBuffer.toByteArray()
                }
                EntryInput(
                    kind = nativeEntry.kind,
                    sourcePath = nativeEntry.sourcePath,
                    archivePath = nativeEntry.archivePath,
                    data = data
                )
            }

            val plan = CreationPlan(
                entries = entryInputs,
                compressionProfile = request.compressionProfile,
                compressionLevel = request.compressionLevel?.toInt(),
                storeAlreadyCompressed = request.storeAlreadyCompressed ?: true,
                encryptionMethod = request.encryptionMethod,
                encryptionPassword = request.encryptionPassword
            )

            val output = LocalFileOutput(path = destinationPath)

            emitProgress(phase = "compressing")

            val useCase = CreateArchiveUseCase(engine)
            val result = useCase.execute(
                plan = plan,
                output = output,
                onProgress = { snapshot ->
                    emitProgress(
                        phase = "compressing",
                        processedBytes = snapshot.processedBytes,
                        totalBytes = snapshot.totalBytes,
                        processedEntries = snapshot.processedEntries.toDouble(),
                        totalEntries = snapshot.totalEntries?.toDouble(),
                        currentEntry = snapshot.currentEntry
                    )
                }
            )

            emitProgress(phase = "finalizing")

            val duration = System.currentTimeMillis() - startTime
            stateMachine.succeed()

            NativeCreationResult(
                operationId = operationId,
                entryCount = result.entryCount.toDouble(),
                inputBytes = result.inputBytes,
                outputBytes = result.outputBytes,
                durationMs = duration.toDouble(),
                atomicWriteApplied = false,
                warnings = emptyArray()
            )
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

    private fun emitProgress(
        phase: String,
        processedBytes: Long = 0L,
        totalBytes: Long? = null,
        processedEntries: Double = 0.0,
        totalEntries: Double? = null,
        currentEntry: String? = null
    ) {
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
            processedBytes = processedBytes,
            totalBytes = totalBytes,
            processedEntries = processedEntries,
            totalEntries = totalEntries,
            currentEntry = currentEntry,
            bytesPerSecond = null,
            estimatedSecondsRemaining = null,
            percentage = percentage
        )
        latestProgress = snapshot
        listeners.forEach { it(snapshot) }
    }
}
