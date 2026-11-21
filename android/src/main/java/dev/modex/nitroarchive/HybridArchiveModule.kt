package dev.modex.nitroarchive

import com.margelo.nitro.archive.*
import com.margelo.nitro.core.ArrayBuffer
import com.margelo.nitro.core.Promise
import dev.modex.nitroarchive.application.OpenArchiveUseCase
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.infrastructure.memory.BufferArchiveInput
import dev.modex.nitroarchive.infrastructure.storage.LocalFileInput
import dev.modex.nitroarchive.infrastructure.storage.MAX_ARCHIVE_INPUT_BYTES
import dev.modex.nitroarchive.infrastructure.storage.copyBoundedTo
import dev.modex.nitroarchive.infrastructure.storage.readArchiveBytes
import dev.modex.nitroarchive.infrastructure.storage.withArchiveStage
import dev.modex.nitroarchive.infrastructure.zip.RustZipArchive
import dev.modex.nitroarchive.platform.AndroidArchiveAccessInspector
import java.io.File

open class HybridArchiveModule() : HybridArchiveModuleSpec() {
    private val context get() =
        com.margelo.nitro.NitroModules.applicationContext?.applicationContext
            ?: throw ArchiveDomainError.Internal("NitroModules not initialized")
    private val openArchive = OpenArchiveUseCase(RustZipArchive::inspect)
    private val accessInspector by lazy { AndroidArchiveAccessInspector(context) }

    override fun getCapabilities(): NativeArchiveCapabilities {
        return NativeArchiveCapabilities(
            platform = NativePlatform.ANDROID,
            readableFormats = arrayOf("zip", "tar", "tar.gz"),
            writableFormats = arrayOf("zip", "tar", "tar.gz"),
            compressionMethods = arrayOf("store", "deflate"),
            encryptionMethods = arrayOf("none", "zip-crypto", "aes-256"),
            supportsFilePaths = true,
            supportsInputUris = true,
            supportsOutputUris = true,
            supportsDirectoryUris = false,
            supportsAtomicPathWrites = true,
            supportsSecurityScopedUrls = false,
            supportsZip64 = true
        )
    }

    override fun checkFileAccess(path: String, mode: String): Promise<NativeAccessOutcome> = Promise.async {
        val report = accessInspector.checkFileAccess(path, parseAccessMode(mode))
        NativeAccessOutcome(
            ok = report.accessible,
            accessible = report.accessible,
            readable = report.readable,
            writable = report.writable,
            persistent = true,
            securityScoped = false,
            providerBacked = false,
            seekable = true,
            reason = report.reason,
            recoveryAction = if (report.accessible) "none" else "choose-document",
            error = if (report.accessible) null else NativeArchiveFailure(ArchiveErrorCode.E_PERMISSION_DENIED, report.reason ?: "Access denied", null, null, null, null, null)
        )
    }

    override fun checkUriAccess(uri: String, mode: String): Promise<NativeAccessOutcome> = Promise.async {
        val report = accessInspector.checkUriAccess(uri, parseAccessMode(mode))
        NativeAccessOutcome(
            ok = report.accessible,
            accessible = report.accessible,
            readable = report.readable,
            writable = report.writable,
            persistent = false,
            securityScoped = false,
            providerBacked = true,
            seekable = null,
            reason = report.reason,
            recoveryAction = if (report.accessible) "none" else "reselect-document",
            error = if (report.accessible) null else NativeArchiveFailure(ArchiveErrorCode.E_PERMISSION_DENIED, report.reason ?: "Access denied", null, null, null, null, null)
        )
    }

    override fun detectFile(path: String): Promise<NativeDetectionOutcome> = Promise.async {
        detectOutcome(path) {
            val format = if (File(path).exists()) RustZipArchive.detect(path) else null
            val matches = format?.let {
                path.endsWith(".$it", ignoreCase = true) ||
                    (it == "tar.gz" && path.endsWith(".tgz", ignoreCase = true))
            }
            NativeDetectionOutcome(true, format, if (format == null) 0.0 else 1.0, matches, null)
        }
    }

    override fun detectUri(uri: String): Promise<NativeDetectionOutcome> = Promise.async {
        val parsed = android.net.Uri.parse(uri)
        if (parsed.scheme == "file") return@async detectFile(parsed.path ?: uri).await()
        detectOutcome(uri) {
            val format = withArchiveStage(context.cacheDir) { stage ->
                val file = File(stage, "archive")
                context.contentResolver.openInputStream(parsed)?.use { it.copyBoundedTo(file) { false } }
                    ?: throw ArchiveDomainError.FileNotAvailable("Cannot open archive for detection")
                RustZipArchive.detect(file.absolutePath)
            }
            NativeDetectionOutcome(true, format, if (format == null) 0.0 else 1.0, null, null)
        }
    }

    override fun detectBuffer(data: ArrayBuffer): Promise<NativeDetectionOutcome> {
        val bytes = if (data.size <= MAX_ARCHIVE_INPUT_BYTES) data.toByteArray() else null
        return Promise.async {
            detectOutcome(null) {
                val format = RustZipArchive.detect(bytes ?: throw ArchiveDomainError.ArchiveTooLarge())
                NativeDetectionOutcome(true, format, if (format == null) 0.0 else 1.0, null, null)
            }
        }
    }

    private inline fun detectOutcome(source: String?, action: () -> NativeDetectionOutcome): NativeDetectionOutcome =
        try {
            action()
        } catch (error: Exception) {
            val failure = archiveDomainFailure(error) ?: throw error
            NativeDetectionOutcome(false, null, 0.0, null, archiveFailure(failure, source = source))
        }

    override fun openFile(path: String, options: NativePathOpenOptions): Promise<NativeOpenOutcome> = Promise.async {
        try {
            val input = LocalFileInput(path)
            val result = openArchive.execute(input)
            val reader = HybridArchiveReader(
                inspection = result.inspection,
                session = result.session,
                cacheDirectory = context.cacheDir
            )
            NativeOpenOutcome(ok = true, reader = reader, error = null)
        } catch (e: ArchiveDomainError) {
            NativeOpenOutcome(ok = false, reader = null, error = NativeArchiveFailure(
                code = mapCode(e.code),
                message = e.message ?: e.code,
                operationId = null, entryPath = null, source = path, destination = null, nativeCode = null
            ))
        } catch (e: Exception) {
            NativeOpenOutcome(ok = false, reader = null, error = NativeArchiveFailure(
                code = ArchiveErrorCode.E_IO,
                message = e.message ?: "I/O error",
                operationId = null, entryPath = null, source = path, destination = null, nativeCode = null
            ))
        }
    }

    override fun openUri(uri: String, options: NativeUriOpenOptions): Promise<NativeOpenOutcome> = Promise.async {
        val androidUri = android.net.Uri.parse(uri)
        if (androidUri.scheme == "file") {
            val pathOptions = NativePathOpenOptions(
                password = options.password,
                maxEntriesToIndex = options.maxEntriesToIndex,
                maxCentralDirectoryBytes = options.maxCentralDirectoryBytes
            )
            return@async openFile(androidUri.path ?: uri, pathOptions).await()
        }

        try {
            val ctx = context
            val inputStream = ctx.contentResolver.openInputStream(androidUri)
                ?: throw ArchiveDomainError.FileNotAvailable("Cannot open input stream for URI: $uri")
            val bytes = inputStream.use { it.readArchiveBytes() }
            val bufferInput = BufferArchiveInput(bytes)
            val result = openArchive.execute(bufferInput)
            val reader = HybridArchiveReader(
                inspection = result.inspection,
                session = result.session,
                cacheDirectory = context.cacheDir
            )
            NativeOpenOutcome(ok = true, reader = reader, error = null)
        } catch (e: ArchiveDomainError) {
            NativeOpenOutcome(ok = false, reader = null, error = NativeArchiveFailure(
                code = mapCode(e.code), message = e.message ?: e.code,
                operationId = null, entryPath = null, source = uri, destination = null, nativeCode = null
            ))
        } catch (e: Exception) {
            NativeOpenOutcome(ok = false, reader = null, error = NativeArchiveFailure(
                code = ArchiveErrorCode.E_IO,
                message = e.message ?: "I/O error reading content:// URI",
                operationId = null, entryPath = null, source = uri, destination = null, nativeCode = null
            ))
        }
    }

    override fun openBuffer(data: ArrayBuffer, options: NativeBufferOpenOptions): Promise<NativeOpenOutcome> {
        val bytes = if (data.size <= MAX_ARCHIVE_INPUT_BYTES) data.toByteArray() else null
        return Promise.async {
        try {
            val input = BufferArchiveInput(bytes ?: throw ArchiveDomainError.ArchiveTooLarge())
            val result = openArchive.execute(input)
            val reader = HybridArchiveReader(
                inspection = result.inspection,
                session = result.session,
                cacheDirectory = context.cacheDir
            )
            NativeOpenOutcome(ok = true, reader = reader, error = null)
        } catch (e: ArchiveDomainError) {
            NativeOpenOutcome(ok = false, reader = null, error = NativeArchiveFailure(
                code = mapCode(e.code), message = e.message ?: e.code,
                operationId = null, entryPath = null, source = options.name, destination = null, nativeCode = null
            ))
        } catch (e: Exception) {
            NativeOpenOutcome(ok = false, reader = null, error = NativeArchiveFailure(
                code = ArchiveErrorCode.E_IO, message = e.message ?: "I/O error",
                operationId = null, entryPath = null, source = options.name, destination = null, nativeCode = null
            ))
        }
    }

    }

    override fun create(request: NativeCreationRequest): HybridNativeCreationTaskSpec =
        HybridCreationTask(context = context, request = request)

    private fun mapCode(code: String): ArchiveErrorCode {
        return try {
            ArchiveErrorCode.valueOf(code)
        } catch (_: IllegalArgumentException) {
            ArchiveErrorCode.E_INTERNAL
        }
    }
}
