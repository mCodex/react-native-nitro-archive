package com.mcodex.nitroarchive.domain

enum class SymlinkPolicy { REJECT, MATERIALIZE, PRESERVE_SAFE }

enum class OverwritePolicy { ERROR, SKIP, REPLACE, RENAME }

enum class DuplicateEntryPolicy { ERROR, FIRST, LAST }
