package com.mcodex.nitroarchive

internal fun Long.toNativeByteCount(): Long = this

internal fun String?.toLongOrDefault(defaultValue: Long): Long =
    this?.toLongOrNull() ?: defaultValue
