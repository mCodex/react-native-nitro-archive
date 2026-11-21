package dev.modex.nitroarchive.application.ports

data class ArchiveInspection(
    val format: String,
    val entryCount: Int,
    val entries: List<EntryDescriptor>,
    val compressedSize: Long?,
    val totalUncompressedSize: Long?,
    val encrypted: Boolean,
    val comment: String?
)

data class EntryDescriptor(
    val index: Int,
    val path: String,
    val kind: String,
    val compressedSize: Long,
    val uncompressedSize: Long,
    val encrypted: Boolean,
    val compressionMethod: String,
    val crc32: UInt? = null,
    val unixMode: UShort? = null
)
