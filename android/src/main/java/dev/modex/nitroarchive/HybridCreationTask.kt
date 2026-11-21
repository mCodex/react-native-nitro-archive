package dev.modex.nitroarchive

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import com.margelo.nitro.archive.*
import com.margelo.nitro.core.Promise
import dev.modex.nitroarchive.application.ArchiveGlob
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.TaskState
import dev.modex.nitroarchive.domain.TaskStateMachine
import dev.modex.nitroarchive.infrastructure.storage.*
import dev.modex.nitroarchive.infrastructure.zip.RustZipArchive
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import org.json.JSONArray
import org.json.JSONObject

class HybridCreationTask(
    private val context: Context,
    private val request: NativeCreationRequest
) : HybridNativeCreationTaskSpec() {
    private val copiedData = if (request.entries.size <= 10_000 &&
        request.entries.sumOf { it.data?.size?.toLong() ?: 0L } <=
        minOf(request.maxInMemoryBytes?.toLong() ?: 16 * 1024 * 1024L, MAX_ARCHIVE_INPUT_BYTES.toLong())
    ) request.entries.map { it.data?.toByteArray() } else null
    private val stateMachine = TaskStateMachine()
    private val operationId = UUID.randomUUID().toString()
    private val listeners = CopyOnWriteArrayList<(NativeProgress) -> Unit>()
    private var latestProgress = createInitialProgress(operationId)

    override val state: String get() = stateMachine.state.name.lowercase()
    override val progress: NativeProgress get() = latestProgress

    override fun start(): Promise<NativeCreationResult> = Promise.async {
        stateMachine.start()
        val startedAt = SystemClock.elapsedRealtime()
        try {
            val result = withArchiveStage(context.cacheDir) { staging ->
                latestProgress = emitProgress(operationId, "preparing", listeners = listeners)
                val entries = prepareEntries(staging, copiedData ?: throw ArchiveDomainError.ArchiveTooLarge())
                val output = File(staging, "output")
                latestProgress = emitProgress(operationId, "compressing", totalEntries = entries.length().toDouble(), listeners = listeners)
                var lastProgressAt = SystemClock.elapsedRealtime()
                val result = output.withWriteDescriptor { fd ->
                    val params = JSONObject()
                        .put("operation", "create")
                        .put("format", request.format ?: "zip")
                        .put("outputFd", fd)
                        .put("entries", entries)
                        .put("compressionLevel", request.compressionLevel?.toInt() ?: when (request.compressionProfile) {
                            "fastest" -> 1
                            "smallest" -> 9
                            else -> 6
                        })
                        .put("storeAlreadyCompressed", request.storeAlreadyCompressed ?: true)
                        .put("encryptionMethod", request.encryptionMethod)
                    RustZipArchive.operation(params, request.encryptionPassword) { bytes, count ->
                        val now = SystemClock.elapsedRealtime()
                        if (now - lastProgressAt >= (request.progressIntervalMs?.toLong() ?: 100L)) {
                            lastProgressAt = now
                            latestProgress = emitProgress(
                                operationId, "compressing", processedBytes = bytes,
                                processedEntries = count.toDouble(), totalEntries = entries.length().toDouble(),
                                currentEntry = entries.optJSONObject(count.toInt())?.optString("path"), listeners = listeners
                            )
                        }
                        isCancelled()
                    }
                }
                latestProgress = emitProgress(
                    operationId, "finalizing", processedBytes = result.getLong("inputBytes"),
                    processedEntries = entries.length().toDouble(), totalEntries = entries.length().toDouble(),
                    listeners = listeners
                )
                stateMachine.beginCommit()
                val atomic = publish(output)
                NativeCreationResult(
                    operationId, result.getInt("entryCount").toDouble(), result.getLong("inputBytes").toDouble(),
                    result.getLong("outputBytes").toDouble(), (SystemClock.elapsedRealtime() - startedAt).toDouble(),
                    atomic, emptyArray(), null
                )
            }
            stateMachine.succeed()
            result
        } catch (error: Exception) {
            val domain = archiveDomainFailure(error)
            if (domain is ArchiveDomainError.OperationCancelled) stateMachine.markCancelled() else stateMachine.fail()
            if (domain == null) throw error
            NativeCreationResult(
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

    private fun publish(output: File): Boolean = when (request.destinationKind) {
        "file" -> {
            val target = rootedDestination(File(request.destinationPath
                ?: throw ArchiveDomainError.InvalidArgument("A destination path is required")))
            val destination = SafeDirectoryOutput(target.parentFile
                ?: throw ArchiveDomainError.InvalidArgument("A destination directory is required"))
            try {
                destination.publish(target.name, output, request.existingDestination ?: "error")
                destination.commit()
            } catch (error: Exception) {
                runCatching { destination.rollback() }.exceptionOrNull()?.let(error::addSuppressed)
                throw error
            }
            true
        }
        "uri" -> {
            val uri = Uri.parse(request.destinationUri
                ?: throw ArchiveDomainError.InvalidArgument("A destination URI is required"))
            context.contentResolver.openOutputStream(uri, "wt")?.use { destination ->
                output.inputStream().use { it.copyTo(destination) }
            } ?: throw ArchiveDomainError.FileNotAvailable("Cannot open archive destination")
            false
        }
        else -> throw ArchiveDomainError.InvalidArgument("Unsupported archive destination")
    }

    private fun prepareEntries(staging: File, data: List<ByteArray?>): JSONArray {
        val entries = JSONArray()
        var stagedBytes = data.sumOf { it?.size?.toLong() ?: 0L }

        fun add(path: String, kind: String, source: File?, entry: NativeEntryInput) {
            checkCancellation()
            if (entries.length() >= 10_000) throw ArchiveDomainError.ArchiveTooLarge()
            entries.put(JSONObject()
                .put("path", path)
                .put("kind", kind)
                .put("sourcePath", if (kind == "file") source?.absolutePath else null)
                .put("compressionMethod", entry.compressionMethod)
                .put("modifiedAt", if (request.preserveTimestamps == false) null
                    else entry.modifiedAt ?: source?.lastModified()?.toDouble()))
        }

        for ((index, entry) in request.entries.withIndex()) {
            checkCancellation()
            when (entry.kind) {
                "directory" -> expandDirectory(entry, ::add)
                "file" -> add(entry.archivePath, "file", File(entry.sourcePath
                    ?: throw ArchiveDomainError.InvalidArgument("A source path is required")), entry)
                "buffer", "uri" -> {
                    val source = File(staging, "input-$index")
                    if (entry.kind == "buffer") {
                        source.writeBytes(data[index] ?: throw ArchiveDomainError.InvalidArgument("Missing buffer bytes"))
                    } else {
                        val uri = Uri.parse(entry.sourceUri
                            ?: throw ArchiveDomainError.InvalidArgument("A source URI is required"))
                        val limit = minOf(MAX_ARCHIVE_INPUT_BYTES.toLong(), (2L shl 30) - stagedBytes)
                        stagedBytes += context.contentResolver.openInputStream(uri)?.use {
                            it.copyBoundedTo(source, limit, ::isCancelled)
                        }
                            ?: throw ArchiveDomainError.FileNotAvailable("Cannot open archive source")
                    }
                    add(entry.archivePath, "file", source, entry)
                }
                else -> throw ArchiveDomainError.InvalidArgument("Unsupported archive entry source")
            }
        }
        return entries
    }

    private fun expandDirectory(entry: NativeEntryInput, add: (String, String, File?, NativeEntryInput) -> Unit) {
        val source = File(entry.sourcePath ?: throw ArchiveDomainError.InvalidArgument("A directory source path is required"))
        val ancestors = HashSet<File>()

        fun walk(candidate: File, path: String, depth: Int): Boolean {
            checkCancellation()
            if (depth > 32) throw ArchiveDomainError.ArchiveTooLarge()
            if (entry.exclude?.any { ArchiveGlob.matches(it, path) } == true) return false
            val included = entry.include?.any { ArchiveGlob.matches(it, path) } ?: true
            val real = if (OsConstants.S_ISLNK(Os.lstat(candidate.path).st_mode)) {
                if (entry.followSymlinks != true) throw ArchiveDomainError.UnsafeSymlink(path)
                candidate.canonicalFile
            } else candidate
            val mode = Os.lstat(real.path).st_mode
            if (OsConstants.S_ISREG(mode)) {
                if (depth == 0) throw ArchiveDomainError.InvalidArgument("Directory source is a file")
                if (included) add(path, "file", real, entry)
                return included
            }
            if (!OsConstants.S_ISDIR(mode)) throw ArchiveDomainError.SpecialFile(path)
            if (depth > 0 && entry.recursive == false) return false
            val canonical = real.canonicalFile
            if (!ancestors.add(canonical)) throw ArchiveDomainError.UnsafeSymlink(path)
            var added = false
            try {
                val children = real.listFiles()?.sortedBy { it.name }
                    ?: throw ArchiveDomainError.FileNotAvailable("Cannot list archive source directory")
                for (child in children) {
                    if (entry.includeHidden == true || !child.name.startsWith('.')) {
                        added = walk(child, "$path/${child.name}", depth + 1) || added
                    }
                }
            } finally {
                ancestors.remove(canonical)
            }
            if (included && (added || request.includeEmptyDirectories != false)) {
                add(path, "directory", real, entry)
                return true
            }
            return added
        }

        walk(source, entry.archivePath.trimEnd('/'), 0)
    }
}
