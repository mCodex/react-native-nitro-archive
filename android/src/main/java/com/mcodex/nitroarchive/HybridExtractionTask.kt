package com.mcodex.nitroarchive

import com.margelo.nitro.archive.*
import com.margelo.nitro.core.Promise
import com.mcodex.nitroarchive.application.ExtractArchiveUseCase
import com.mcodex.nitroarchive.application.ExtractionPlanner
import com.mcodex.nitroarchive.application.ports.ArchiveEngine
import com.mcodex.nitroarchive.application.ports.ArchiveEngineSession
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.ExtractionLimits
import com.mcodex.nitroarchive.domain.TaskState
import com.mcodex.nitroarchive.domain.TaskStateMachine
import com.mcodex.nitroarchive.infrastructure.storage.SafeDirectoryOutput
import java.io.File
import java.util.UUID

class HybridExtractionTask(
    private val session: ArchiveEngineSession,
    private val engine: ArchiveEngine,
    private val request: NativeExtractionRequest
) : HybridNativeExtractionTaskSpec() {

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

    override fun start(): Promise<NativeExtractionResult> = Promise.async {
        stateMachine.start()
        val startTime = System.currentTimeMillis()
        emitProgress(phase = "preparing")

        val destinationPath = when (request.destinationKind) {
            "directory" -> request.destinationPath
                ?: throw ArchiveDomainError.InvalidArgument("destinationPath required for directory extraction")
            else -> throw ArchiveDomainError.InvalidArgument("Unsupported destination kind: ${request.destinationKind}")
        }

        val limits = ExtractionLimits(
            maxEntries = request.limits?.maxEntries?.toInt() ?: 10000,
            maxTotalUncompressedBytes = request.limits?.maxTotalUncompressedBytes ?: 2_147_483_648L,
            maxEntryUncompressedBytes = request.limits?.maxEntryUncompressedBytes ?: 536_870_912L,
            maxCompressionRatio = request.limits?.maxCompressionRatio?.toInt() ?: 1000,
            maxPathDepth = request.limits?.maxPathDepth?.toInt() ?: 32,
            maxPathBytes = request.limits?.maxPathBytes?.toInt() ?: 1024
        )

        val plan = if (!request.entries.isNullOrEmpty()) {
            val descriptors = request.entries.mapNotNull { session.entry(it) }
            com.mcodex.nitroarchive.application.ExtractionPlan(
                entries = descriptors,
                totalUncompressedBytes = descriptors.sumOf { it.uncompressedSize },
                totalEntries = descriptors.size
            )
        } else {
            val planner = ExtractionPlanner()
            planner.plan(
                allEntries = session.entries,
                include = request.include?.toList(),
                exclude = request.exclude?.toList(),
                limits = limits
            )
        }

        val useCase = ExtractArchiveUseCase(engine)
        val output = SafeDirectoryOutput(File(destinationPath))
        val cleanupOnError = request.cleanupOnError ?: true
        val cleanupOnCancel = request.cleanupOnCancel ?: true

        try {
            emitProgress(
                phase = "extracting",
                totalEntries = plan.totalEntries.toDouble()
            )

            val summary = useCase.execute(
                session = session,
                entries = plan.entries,
                output = output,
                limits = limits,
                password = request.password,
                onEntryProgress = { path, index, total ->
                    if (stateMachine.state == TaskState.CANCELLING) {
                        throw ArchiveDomainError.OperationCancelled()
                    }
                    emitProgress(
                        phase = "extracting",
                        processedEntries = index.toDouble(),
                        totalEntries = total.toDouble(),
                        currentEntry = path
                    )
                }
            )

            if (stateMachine.state == TaskState.CANCELLING) {
                throw ArchiveDomainError.OperationCancelled()
            }

            emitProgress(
                phase = "finalizing",
                processedEntries = plan.totalEntries.toDouble(),
                totalEntries = plan.totalEntries.toDouble()
            )
            output.commit()

            val duration = System.currentTimeMillis() - startTime
            stateMachine.succeed()

            NativeExtractionResult(
                operationId = operationId,
                extractedEntries = summary.extractedEntries.toDouble(),
                skippedEntries = summary.skippedEntries.toDouble(),
                writtenBytes = summary.writtenBytes,
                durationMs = duration.toDouble(),
                atomicWriteApplied = false,
                warnings = emptyArray()
            )
        } catch (e: ArchiveDomainError.OperationCancelled) {
            if (cleanupOnCancel) output.rollback()
            stateMachine.markCancelled()
            throw e
        } catch (e: ArchiveDomainError) {
            if (cleanupOnError) output.rollback()
            stateMachine.fail()
            throw e
        } catch (e: Exception) {
            if (cleanupOnError) output.rollback()
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
