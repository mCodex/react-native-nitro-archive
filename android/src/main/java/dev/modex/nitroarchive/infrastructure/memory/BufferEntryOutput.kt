package com.mcodex.nitroarchive.infrastructure.memory

import com.mcodex.nitroarchive.application.ports.ArchiveOutput

class BufferEntryOutput : ArchiveOutput {
    private val _data = mutableListOf<ByteArray>()
    private var _concatenated: ByteArray? = null

    val data: ByteArray
        get() {
            if (_concatenated == null && _data.isNotEmpty()) {
                _concatenated = _data.reduce { a, b -> a + b }
            }
            return _concatenated ?: ByteArray(0)
        }

    override suspend fun write(data: ByteArray) {
        _data.add(data)
        _concatenated = null
    }

    override suspend fun finalize() {
        _concatenated = if (_data.isNotEmpty()) _data.reduce { a, b -> a + b } else ByteArray(0)
    }
}
