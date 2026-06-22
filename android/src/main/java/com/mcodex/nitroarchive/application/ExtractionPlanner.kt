package com.mcodex.nitroarchive.application

import com.mcodex.nitroarchive.application.ports.EntryDescriptor
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
        var filtered = allEntries

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
            filtered = filtered.take(limits.maxEntries)
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
