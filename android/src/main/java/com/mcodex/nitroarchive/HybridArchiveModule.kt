package com.mcodex.nitroarchive

import android.content.Context
import com.margelo.nitro.archive.*
import com.margelo.nitro.core.ArrayBuffer
import com.margelo.nitro.core.Promise
import com.mcodex.nitroarchive.application.CreateArchiveUseCase
import com.mcodex.nitroarchive.application.OpenArchiveUseCase
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.infrastructure.memory.BufferArchiveInput
import com.mcodex.nitroarchive.infrastructure.storage.LocalFileInput
import com.mcodex.nitroarchive.infrastructure.zip.Zip4jEngine
import com.mcodex.nitroarchive.platform.AndroidArchiveAccessInspector
import java.io.File
import java.io.RandomAccessFile

class HybridArchiveModule(context: Context) : HybridArchiveModuleSpec() {
    private val engine = Zip4jEngine()
    private val accessInspector = AndroidArchiveAccessInspector(context)

    override fun getCapabilities(): NativeArchiveCapabilities {
        return NativeArchiveCapabilities(
            platform = NativePlatform.ANDROID,
            readableFormats = arrayOf("zip"),
            writableFormats = arrayOf("zip"),
            compressionMethods = arrayOf("store", "deflate"),
            encryptionMethods = arrayOf("none"),
            supportsFilePaths = true,
            supportsInputUris = true,
            supportsOutputUris = true,
            supportsDirectoryUris = true,
            supportsAtomicPathWrites = false,
            supportsSecurityScopedUrls = false,
            supportsZip64 = true
        )
    }

    override fun checkFileAccess(path: String, mode: String): Promise<NativeAccessOutcome> = Promise.async {
        val accessMode = if (mode == "write" || mode == "create-children") {
            com.mcodex.nitroarchive.application.ports.ArchiveAccessMode.WRITE
        } else {
            com.mcodex.nitroarchive.application.ports.ArchiveAccessMode.READ
        }
        val report = accessInspector.checkFileAccess(path, accessMode)
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
        val accessMode = if (mode == "write" || mode == "create-children") {
            com.mcodex.nitroarchive.application.ports.ArchiveAccessMode.WRITE
        } else {
            com.mcodex.nitroarchive.application.ports.ArchiveAccessMode.READ
        }
        val report = accessInspector.checkUriAccess(uri, accessMode)
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
        val file = File(path)
        if (!file.exists() || file.length() < 4) {
            return@async NativeDetectionOutcome(ok = true, format = null, confidence = 0.0, extensionMatches = null, error = null)
        }
        val raf = RandomAccessFile(file, "r")
        val signature = ByteArray(4)
        raf.readFully(signature)
        raf.close()
        val isZip = signature[0] == 0x50.toByte() && signature[1] == 0x4B.toByte() && signature[2] == 0x03.toByte() && signature[3] == 0x04.toByte()
        val extMatch = path.endsWith(".zip", ignoreCase = true)
        NativeDetectionOutcome(
            ok = true,
            format = if (isZip) "zip" else null,
            confidence = if (isZip) 1.0 else 0.0,
            extensionMatches = extMatch,
            error = null
        )
    }

    override fun detectUri(uri: String): Promise<NativeDetectionOutcome> = Promise.async {
        val androidUri = android.net.Uri.parse(uri)
        if (androidUri.scheme == "file") {
            detectFile(androidUri.path ?: uri).await()
        } else {
            NativeDetectionOutcome(ok = true, format = "zip", confidence = 1.0, extensionMatches = true, error = null)
        }
    }

    override fun detectBuffer(data: ArrayBuffer): Promise<NativeDetectionOutcome> = Promise.async {
        val bytes = data.toByteArray()
        if (bytes.size < 4) {
            return@async NativeDetectionOutcome(ok = true, format = null, confidence = 0.0, extensionMatches = null, error = null)
        }
        val isZip = bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte() && bytes[2] == 0x03.toByte() && bytes[3] == 0x04.toByte()
        NativeDetectionOutcome(
            ok = true,
            format = if (isZip) "zip" else null,
            confidence = if (isZip) 1.0 else 0.0,
            extensionMatches = null,
            error = null
        )
    }

    override fun openFile(path: String, options: NativePathOpenOptions): Promise<NativeOpenOutcome> = Promise.async {
        try {
            val input = LocalFileInput(path)
            val useCase = OpenArchiveUseCase(engine)
            val result = useCase.execute(input)
            val reader = HybridArchiveReader(
                inspection = result.inspection,
                session = result.session,
                engine = engine
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
        NativeOpenOutcome(ok = false, reader = null, error = NativeArchiveFailure(
            code = ArchiveErrorCode.E_UNSUPPORTED_FORMAT,
            message = "Opening content:// archives not yet implemented",
            operationId = null, entryPath = null, source = uri, destination = null, nativeCode = null
        ))
    }

    override fun openBuffer(data: ArrayBuffer, options: NativeBufferOpenOptions): Promise<NativeOpenOutcome> = Promise.async {
        try {
            val bytes = data.toByteArray()
            val input = BufferArchiveInput(bytes)
            val useCase = OpenArchiveUseCase(engine)
            val result = useCase.execute(input)
            val reader = HybridArchiveReader(
                inspection = result.inspection,
                session = result.session,
                engine = engine
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

    override fun create(request: NativeCreationRequest): HybridNativeCreationTaskSpec {
        return HybridCreationTask(engine = engine, request = request)
    }

    private fun mapCode(code: String): ArchiveErrorCode {
        return try {
            ArchiveErrorCode.valueOf(code)
        } catch (_: IllegalArgumentException) {
            ArchiveErrorCode.E_INTERNAL
        }
    }
}
