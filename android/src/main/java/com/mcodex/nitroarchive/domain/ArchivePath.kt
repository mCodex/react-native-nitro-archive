package com.mcodex.nitroarchive.domain

data class ArchivePath(
    val normalized: String,
    val components: List<String>,
    val depth: Int
) {
    companion object {
        private val DRIVE_LETTERS = ('A'..'Z').map { "$it:" } + ('a'..'z').map { "$it:" }

        fun fromRaw(raw: String): ArchivePath {
            require(raw.indexOf('\u0000') == -1) { "Path contains null bytes" }

            val withSlashes = raw.replace("\\", "/")

            require(!withSlashes.startsWith("/")) { "Path starts with /: $raw" }

            require(!withSlashes.startsWith("//")) { "Path is a UNC path: $raw" }

            val upper = withSlashes.uppercase()
            for (drive in DRIVE_LETTERS) {
                require(!upper.startsWith(drive)) { "Path is a Windows drive path: $raw" }
            }

            require(!withSlashes.contains("://")) { "Path contains URI scheme: $raw" }

            val rawComponents = withSlashes.split("/").filter { it.isNotEmpty() }
            val cleaned = mutableListOf<String>()

            for (component in rawComponents) {
                when (component) {
                    "." -> { /* skip */ }
                    ".." -> throw IllegalArgumentException("Path contains '..' component: $raw")
                    else -> cleaned.add(component)
                }
            }

            require(cleaned.isNotEmpty()) { "Path is empty after normalization: $raw" }

            val normalizedPath = cleaned.joinToString("/") + if (raw.endsWith("/")) "/" else ""

            return ArchivePath(
                normalized = normalizedPath,
                components = cleaned.toList(),
                depth = cleaned.size
            )
        }
    }
}
