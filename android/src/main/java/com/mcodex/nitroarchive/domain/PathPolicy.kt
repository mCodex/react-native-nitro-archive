package com.mcodex.nitroarchive.domain

enum class SymlinkPolicy { REJECT, MATERIALIZE, PRESERVE_SAFE }

enum class OverwritePolicy { ERROR, SKIP, REPLACE, RENAME }

enum class DuplicateEntryPolicy { ERROR, FIRST, LAST }

enum class SecurityPolicy {
    PREVENT_PATH_TRAVERSAL,
    REJECT_ABSOLUTE_PATHS,
    REJECT_SPECIAL_FILES
}
