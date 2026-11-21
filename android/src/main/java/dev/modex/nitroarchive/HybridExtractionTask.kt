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
    private val listeners = java.util.concurrent.CopyOnWriteArrayList<(NativeProgress) -> Unit>()
    private var latestProgress = createInitialProgress(operationId)

    override val state: String get() = stateMachine.state.name.lowercase()
    override val progress: NativeProgress get() = latestProgress

    override fun start(): Promise<NativeExtractionResult> = Promise.async {
        stateMachine.start()
        val startTime = System.currentTimeMillis()
        latestProgress = emitProgress(operationId, phase = "preparing", listeners = listeners)

        val destinationPath = when (request.destinationKind) {
            "directory" -> request.destinationPath
                ?: throw ArchiveDomainError.InvalidArgument("destinationPath required for directory extraction")
            else -> throw ArchiveDomainError.InvalidArgument("Unsupported destination kind: ${request.destinationKind}")
        }

        val limits = ExtractionLimits(
            maxEntries = request.limits?.maxEntries?.toInt() ?: 10000,
            maxTotalUncompressedBytes = request.limits?.maxTotalUncompressedBytes?.toLong() ?: 2_147_483_648L,
            maxEntryUncompressedBytes = request.limits?.maxEntryUncompressedBytes?.toLong() ?: 536_870_912L,
            maxCompressionRatio = request.limits?.maxCompressionRatio?.toInt() ?: 1000,
            maxPathDepth = request.limits?.maxPathDepth?.toInt() ?: 32,
            maxPathBytes = request.limits?.maxPathBytes?.toInt() ?: 1024
        )

        val plan = if (!request.entries.isNullOrEmpty()) {
            val descriptors = request.entries.map { path ->
                session.entry(path) ?: throw ArchiveDomainError.EntryNotFound(path)
            }
            ExtractionPlanner().plan(
                allEntries = descriptors,
                include = null,
                exclude = null,
                limits = limits
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
            latestProgress = emitProgress(
                operationId = operationId,
                phase = "extracting",
                totalEntries = plan.totalEntries.toDouble(),
                listeners = listeners
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
                    latestProgress = emitProgress(
                        operationId = operationId,
                        phase = "extracting",
                        processedEntries = index.toDouble(),
                        totalEntries = total.toDouble(),
                        currentEntry = path,
                        listeners = listeners
                    )
                }
            )

            if (stateMachine.state == TaskState.CANCELLING) {
                throw ArchiveDomainError.OperationCancelled()
            }

            latestProgress = emitProgress(
                operationId = operationId,
                phase = "finalizing",
                processedEntries = plan.totalEntries.toDouble(),
                totalEntries = plan.totalEntries.toDouble(),
                listeners = listeners
            )
            output.commit()

            val duration = System.currentTimeMillis() - startTime
            stateMachine.succeed()

            NativeExtractionResult(
                operationId = operationId,
                extractedEntries = summary.extractedEntries.toDouble(),
                skippedEntries = summary.skippedEntries.toDouble(),
                writtenBytes = summary.writtenBytes.toDouble(),
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
}
