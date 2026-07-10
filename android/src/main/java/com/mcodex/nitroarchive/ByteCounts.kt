package com.mcodex.nitroarchive

internal fun Long.toNativeByteCount(): String = toString()

internal fun String?.toLongOrDefault(defaultValue: Long): Long =
    this?.toLongOrNull() ?: defaultValue
