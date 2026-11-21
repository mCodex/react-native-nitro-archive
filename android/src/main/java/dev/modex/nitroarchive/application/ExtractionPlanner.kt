package dev.modex.nitroarchive.application

import dev.modex.nitroarchive.application.ports.EntryDescriptor
import dev.modex.nitroarchive.domain.ArchiveDomainError
import dev.modex.nitroarchive.domain.ArchivePath
import dev.modex.nitroarchive.domain.DuplicatePathPolicy
import dev.modex.nitroarchive.domain.ExtractionLimits

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
            throw dev.modex.nitroarchive.domain.ArchiveDomainError.ExtractionLimitExceeded(
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

    private fun matchesGlob(path: String, pattern: String): Boolean =
        ArchiveGlob.matches(pattern = pattern, path = path)
}

internal object ArchiveGlob {
    fun matches(pattern: String, path: String): Boolean =
        expandBraces(pattern).any { expanded ->
            matchesComponents(
                pattern = expanded.split('/'),
                path = path.split('/')
            )
        }

    private fun matchesComponents(pattern: List<String>, path: List<String>): Boolean {
        val memo = mutableMapOf<Pair<Int, Int>, Boolean>()

        fun match(patternIndex: Int, pathIndex: Int): Boolean =
            memo.getOrPut(patternIndex to pathIndex) {
                when {
                    patternIndex == pattern.size -> pathIndex == path.size
                    pattern[patternIndex] == "**" ->
                        match(patternIndex + 1, pathIndex) ||
                            (pathIndex < path.size && match(patternIndex, pathIndex + 1))
                    pathIndex >= path.size -> false
                    else ->
                        matchesComponent(pattern[patternIndex], path[pathIndex]) &&
                            match(patternIndex + 1, pathIndex + 1)
                }
            }

        return match(patternIndex = 0, pathIndex = 0)
    }

    private fun matchesComponent(pattern: String, value: String): Boolean {
        val matches = Array(pattern.length + 1) { BooleanArray(value.length + 1) }
        matches[0][0] = true

        for (patternIndex in 1..pattern.length) {
            if (pattern[patternIndex - 1] == '*') {
                matches[patternIndex][0] = matches[patternIndex - 1][0]
            }

            for (valueIndex in 1..value.length) {
                matches[patternIndex][valueIndex] = when (pattern[patternIndex - 1]) {
                    '*' ->
                        matches[patternIndex - 1][valueIndex] ||
                            matches[patternIndex][valueIndex - 1]
                    '?' -> matches[patternIndex - 1][valueIndex - 1]
                    else ->
                        pattern[patternIndex - 1] == value[valueIndex - 1] &&
                            matches[patternIndex - 1][valueIndex - 1]
                }
            }
        }

        return matches[pattern.length][value.length]
    }

    private fun expandBraces(pattern: String): List<String> {
        val opening = pattern.indexOf('{')
        if (opening < 0) return listOf(pattern)

        val closing = pattern.indexOf('}', startIndex = opening + 1)
        if (closing < 0) return listOf(pattern)

        val alternatives = pattern.substring(opening + 1, closing).split(',')
        if (alternatives.none { it.isNotEmpty() }) return listOf(pattern)

        val prefix = pattern.substring(0, opening)
        val suffix = pattern.substring(closing + 1)
        return alternatives.flatMap { expandBraces(prefix + it + suffix) }
    }
}
