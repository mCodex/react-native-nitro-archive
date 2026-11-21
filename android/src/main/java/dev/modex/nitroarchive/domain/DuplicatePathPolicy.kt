package com.mcodex.nitroarchive.domain

class DuplicatePathPolicy(private val policy: DuplicateEntryPolicy = DuplicateEntryPolicy.ERROR) {
    private val seenPaths = mutableSetOf<String>()

    fun check(path: String): Boolean {
        if (path in seenPaths) {
            return when (policy) {
                DuplicateEntryPolicy.ERROR -> throw ArchiveDomainError.DuplicateEntry("Duplicate output path: $path")
                DuplicateEntryPolicy.FIRST -> false
                DuplicateEntryPolicy.LAST -> true
            }
        }
        seenPaths.add(path)
        return true
    }
}
