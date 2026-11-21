package com.mcodex.nitroarchive.domain

data class ExtractionLimits(
    val maxEntries: Int = 10000,
    val maxTotalUncompressedBytes: Long = 2_147_483_648L,
    val maxEntryUncompressedBytes: Long = 536_870_912L,
    val maxCompressionRatio: Int = 1000,
    val maxPathDepth: Int = 32,
    val maxPathBytes: Int = 1024
) {
    companion object {
        val DEFAULT = ExtractionLimits()
    }
}
