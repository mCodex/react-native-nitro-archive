package com.mcodex.nitroarchive

import android.content.Context
import android.net.Uri
import com.margelo.nitro.archive.*
import com.margelo.nitro.core.Promise
import com.mcodex.nitroarchive.application.CreateArchiveUseCase
import com.mcodex.nitroarchive.application.ports.*
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.TaskStateMachine
import com.mcodex.nitroarchive.infrastructure.storage.ContentUriOutput
import com.mcodex.nitroarchive.infrastructure.storage.LocalFileOutput
import java.io.File
import java.util.UUID

class HybridCreationTask(
    private val context: Context,
    private val engine: ArchiveEngine,
    private val request: NativeCreationRequest
) : HybridNativeCreationTaskSpec() {

    private val stateMachine = TaskStateMachine()
    private val operationId = UUID.randomUUID().toString()
    private val listeners = java.util.concurrent.CopyOnWriteArrayList<(NativeProgress) -> Unit>()
    private var latestProgress = NativeProgress(
        operationId = operationId,
        phase = "idle",
        processedBytes = 0L.toNativeByteCount(),
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

            val output = when (request.destinationKind) {
                "file" -> LocalFileOutput(
                    path = request.destinationPath
                        ?: throw ArchiveDomainError.InvalidArgument("destinationPath required for file creation")
                )
                "uri" -> ContentUriOutput(
                    contentResolver = context.contentResolver,
                    uri = Uri.parse(
                        request.destinationUri
                            ?: throw ArchiveDomainError.InvalidArgument("destinationUri required for URI creation")
                    )
                )
                else -> throw ArchiveDomainError.InvalidArgument("Unsupported destination kind: ${request.destinationKind}")
            }

            val entryInputs = request.entries.flatMap { nativeEntry ->
                val data = nativeEntry.data?.let { arrayBuffer ->
                    arrayBuffer.toByteArray()
                }
                when (nativeEntry.kind) {
                    "uri" -> listOf(EntryInput(
                        kind = "buffer",
                        sourcePath = null,
                        archivePath = nativeEntry.archivePath,
                        data = readUriBytes(nativeEntry.sourceUri),
                        compressionMethod = nativeEntry.compressionMethod
                    ))
                    "directory" -> expandDirectory(nativeEntry)
                    else -> listOf(EntryInput(
                        kind = nativeEntry.kind,
                        sourcePath = nativeEntry.sourcePath,
                        archivePath = nativeEntry.archivePath,
                        data = data,
                        compressionMethod = nativeEntry.compressionMethod
                    ))
                }
            }

            val plan = CreationPlan(
                entries = entryInputs,
                compressionProfile = request.compressionProfile,
                compressionLevel = request.compressionLevel?.toInt(),
                storeAlreadyCompressed = request.storeAlreadyCompressed ?: true,
                encryptionMethod = request.encryptionMethod,
                encryptionPassword = request.encryptionPassword
            )

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
                inputBytes = result.inputBytes.toNativeByteCount(),
                outputBytes = result.outputBytes.toNativeByteCount(),
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

    private fun readUriBytes(sourceUri: String?): ByteArray {
        val uri = sourceUri ?: throw ArchiveDomainError.InvalidArgument("URI entry requires sourceUri")
        return context.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
            ?: throw ArchiveDomainError.FileNotAvailable("Cannot open input: $uri")
    }

    private fun expandDirectory(nativeEntry: NativeEntryInput): List<EntryInput> {
        val sourcePath = nativeEntry.sourcePath
            ?: throw ArchiveDomainError.InvalidArgument("Directory entry requires sourcePath")
        val root = File(sourcePath)
        if (!root.isDirectory) {
            throw ArchiveDomainError.FileNotAvailable(sourcePath)
        }

        val baseArchivePath = nativeEntry.archivePath.trimEnd('/')
        val includeHidden = nativeEntry.includeHidden ?: false
        val recursive = nativeEntry.recursive ?: true
        val output = mutableListOf<EntryInput>()

        fun addDirectory(dir: File, archivePath: String) {
            output += EntryInput(
                kind = "directory",
                sourcePath = dir.absolutePath,
                archivePath = archivePath.trimEnd('/') + "/",
                data = null
            )

            val children = dir.listFiles()?.sortedBy { it.name } ?: return
            for (child in children) {
                if (!includeHidden && child.name.startsWith(".")) continue
                val childArchivePath = archivePath.trimEnd('/') + "/" + child.name
                if (child.isDirectory) {
                    if (recursive) addDirectory(child, childArchivePath)
                } else if (child.isFile) {
                    output += EntryInput(
                        kind = "file",
                        sourcePath = child.absolutePath,
                        archivePath = childArchivePath,
                        data = null,
                        compressionMethod = nativeEntry.compressionMethod
                    )
                }
            }
        }

        addDirectory(root, baseArchivePath)
        return output
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
            processedBytes = processedBytes.toNativeByteCount(),
            totalBytes = totalBytes?.toNativeByteCount(),
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
