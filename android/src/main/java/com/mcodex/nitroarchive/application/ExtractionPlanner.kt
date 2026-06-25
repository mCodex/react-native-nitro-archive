package com.mcodex.nitroarchive.application

import com.mcodex.nitroarchive.application.ports.EntryDescriptor
import com.mcodex.nitroarchive.domain.ArchiveDomainError
import com.mcodex.nitroarchive.domain.ArchivePath
import com.mcodex.nitroarchive.domain.DuplicatePathPolicy
import com.mcodex.nitroarchive.domain.ExtractionLimits

data class ExtractionPlan(
    val entries: List<EntryDescriptor>,
    val totalUncompressedBytes: Long,
    val totalEntries: Int
)

class ExtractionPlanner {

    fun plan(
        allEntries: List<EntryDescriptor>,
        include: List<String>?,
        exclude: List<String>?,
        limits: ExtractionLimits = ExtractionLimits.DEFAULT
    ): ExtractionPlan {
        val duplicatePaths = DuplicatePathPolicy()
        var filtered = allEntries.map { entry ->
            val path = try {
                ArchivePath.fromRaw(entry.path)
            } catch (e: IllegalArgumentException) {
                throw ArchiveDomainError.PathTraversal(entry.path)
            }
            if (path.depth > limits.maxPathDepth) {
                throw ArchiveDomainError.ExtractionLimitExceeded("maxPathDepth", "${path.depth}")
            }
            if (path.normalized.toByteArray(Charsets.UTF_8).size > limits.maxPathBytes) {
                throw ArchiveDomainError.ExtractionLimitExceeded("maxPathBytes", "${path.normalized.toByteArray(Charsets.UTF_8).size}")
            }
            duplicatePaths.check(path.normalized)
            entry.copy(path = path.normalized)
        }

        if (!include.isNullOrEmpty()) {
            filtered = filtered.filter { entry ->
                include.any { pattern -> matchesGlob(entry.path, pattern) }
            }
        }

        if (!exclude.isNullOrEmpty()) {
            filtered = filtered.filterNot { entry ->
                exclude.any { pattern -> matchesGlob(entry.path, pattern) }
            }
        }

        if (filtered.size > limits.maxEntries) {
            throw ArchiveDomainError.ExtractionLimitExceeded(
                limit = "maxEntries",
                value = "${filtered.size}"
            )
        }

        filtered.forEach { entry ->
            if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
                throw ArchiveDomainError.ExtractionLimitExceeded(
                    limit = "maxEntryUncompressedBytes",
                    value = "${entry.uncompressedSize}"
                )
            }
            if (entry.compressedSize == 0L && entry.uncompressedSize > 0L) {
                throw ArchiveDomainError.ExtractionLimitExceeded(
                    limit = "maxCompressionRatio",
                    value = "infinite"
                )
            }
            if (entry.compressedSize > 0L && entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio) {
                throw ArchiveDomainError.ExtractionLimitExceeded(
                    limit = "maxCompressionRatio",
                    value = "${entry.uncompressedSize / entry.compressedSize}"
                )
            }
        }

        val totalBytes = filtered.sumOf { it.uncompressedSize }
        if (totalBytes > limits.maxTotalUncompressedBytes) {
            throw com.mcodex.nitroarchive.domain.ArchiveDomainError.ExtractionLimitExceeded(
                limit = "maxTotalUncompressedBytes",
                value = "$totalBytes"
            )
        }

        return ExtractionPlan(
            entries = filtered,
            totalUncompressedBytes = totalBytes,
            totalEntries = filtered.size
        )
    }

    private fun matchesGlob(path: String, pattern: String): Boolean {
        val regex = pattern
            .replace(".", "\\.")
            .replace("**", ".+")
            .replace("*", "[^/]+")
            .replace("?", "[^/]")
            .toRegex()
        return regex.matches(path)
    }
}
