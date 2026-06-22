package com.mcodex.nitroarchive

import com.margelo.nitro.archive.*
import com.margelo.nitro.core.ArrayBuffer
import com.margelo.nitro.core.Promise
import com.mcodex.nitroarchive.application.ports.ArchiveEngine
import com.mcodex.nitroarchive.application.ports.ArchiveEngineSession
import com.mcodex.nitroarchive.application.ports.ArchiveInspection
import com.mcodex.nitroarchive.application.ports.EntryDescriptor
import com.mcodex.nitroarchive.domain.ArchiveDomainError

class HybridArchiveReader(
    private val inspection: ArchiveInspection,
    private val session: ArchiveEngineSession,
    private val engine: ArchiveEngine
) : HybridNativeArchiveReaderSpec() {

    override val format: String get() = inspection.format
    override val entryCount: Double get() = inspection.entryCount.toDouble()
    override val compressedSize: ULong? get() = inspection.compressedSize?.toULong()
    override val totalUncompressedSize: ULong? get() = inspection.totalUncompressedSize?.toULong()
    override val encrypted: Boolean get() = inspection.encrypted
    override val comment: String? get() = inspection.comment

    override fun listEntries(offset: Double, limit: Double, prefix: String?, kinds: Array<String>?): Promise<NativeEntryPage> = Promise.async {
        val allEntries = session.entries
        var filtered = allEntries

        if (!prefix.isNullOrEmpty()) {
            filtered = filtered.filter { it.path.startsWith(prefix) }
        }
        if (!kinds.isNullOrEmpty()) {
            filtered = filtered.filter { kinds.contains(it.kind) }
        }

        val start = offset.toInt()
        val max = limit.toInt()
        if (start >= filtered.size) {
            return@async NativeEntryPage(
                entries = emptyArray(),
                offset = offset,
                nextOffset = null,
                totalEntries = filtered.size.toDouble()
            )
        }
        val end = (start + max).coerceAtMost(filtered.size)
        val page = filtered.subList(start, end)
        val nextOffset = if (end < filtered.size) end.toDouble() else null

        NativeEntryPage(
            entries = page.map { toNativeEntry(it) }.toTypedArray(),
            offset = offset,
            nextOffset = nextOffset,
            totalEntries = filtered.size.toDouble()
        )
    }

    override fun getEntry(path: String): Promise<NativeArchiveEntry?> = Promise.async {
        session.entry(at = path)?.let { toNativeEntry(it) }
    }

    override fun readEntry(path: String, maxBytes: ULong, password: String?, verifyChecksum: Boolean?): Promise<ArrayBuffer> = Promise.async {
        val data = engine.readEntry(
            session = session,
            path = path,
            limit = maxBytes.toLong(),
            password = password
        )
        ArrayBuffer.copy(data)
    }

    override fun startExtraction(request: NativeExtractionRequest): HybridNativeExtractionTaskSpec {
        return HybridExtractionTask(session = session, engine = engine, request = request)
    }

    override fun startValidation(request: NativeValidationRequest): HybridNativeValidationTaskSpec {
        return HybridValidationTask(session = session, engine = engine, request = request)
    }

    private fun toNativeEntry(entry: EntryDescriptor): NativeArchiveEntry {
        val name = if (entry.path.contains("/")) entry.path.substringAfterLast("/") else entry.path
        val parent = if (entry.path.contains("/")) entry.path.substringBeforeLast("/") else ""
        return NativeArchiveEntry(
            index = entry.index.toDouble(),
            path = entry.path,
            name = name,
            parentPath = parent,
            kind = entry.kind,
            compressedSize = entry.compressedSize,
            uncompressedSize = entry.uncompressedSize,
            encrypted = entry.encrypted,
            compressionMethod = entry.compressionMethod,
            modifiedAt = null,
            crc32 = entry.crc32?.toDouble(),
            unixMode = entry.unixMode?.toDouble()
        )
    }
}
