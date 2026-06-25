package com.mcodex.nitroarchive.infrastructure.zip

import net.lingala.zip4j.model.enums.EncryptionMethod

/**
 * Maps string encryption method names to Zip4j EncryptionMethod enum.
 */
object Zip4jEncryptionMapper {

    /**
     * Returns the Zip4j EncryptionMethod for the given method string.
     * Returns null if the method is "none" or unrecognized.
     */
    fun toZip4j(method: String?): EncryptionMethod? {
        return when (method) {
            "zip-crypto" -> EncryptionMethod.ZIP_STANDARD
            "aes-128" -> EncryptionMethod.AES
            "aes-256" -> EncryptionMethod.AES
            else -> null
        }
    }

    /**
     * Returns true if the given method string represents an encryption method.
     */
    fun isEncrypted(method: String?): Boolean {
        return method != null && method != "none"
    }
}
