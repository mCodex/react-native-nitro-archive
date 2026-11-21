#ifndef NITRO_ARCHIVE_CORE_H
#define NITRO_ARCHIVE_CORE_H

#include <stddef.h>
#include <stdint.h>

#if defined(__clang__)
#define NITRO_ARCHIVE_NULLABLE _Nullable
#define NITRO_ARCHIVE_NONNULL _Nonnull
#else
#define NITRO_ARCHIVE_NULLABLE
#define NITRO_ARCHIVE_NONNULL
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* The input remains owned by the caller and is borrowed until return.
 * The UTF-8 JSON result is NUL-terminated and must be released with
 * nitro_archive_free_json_v1. NULL indicates an internal failure. */
char *NITRO_ARCHIVE_NULLABLE nitro_archive_inspect_v1(
    const uint8_t *NITRO_ARCHIVE_NULLABLE bytes, size_t length);
char *NITRO_ARCHIVE_NULLABLE nitro_archive_inspect_file_v1(
    const char *NITRO_ARCHIVE_NONNULL path);
void nitro_archive_free_json_v1(char *NITRO_ARCHIVE_NULLABLE json);

typedef struct NitroArchiveBytesResult {
  uint8_t *NITRO_ARCHIVE_NULLABLE bytes;
  size_t length;
  char *NITRO_ARCHIVE_NULLABLE error;
} NitroArchiveBytesResult;

/* Paths are NUL-terminated UTF-8. A zero password length means no password.
 * error is NULL on success. An empty result has NULL bytes and length zero.
 * The caller releases each result once, even when error is non-NULL. */
NitroArchiveBytesResult nitro_archive_read_entry_v1(
    const uint8_t *NITRO_ARCHIVE_NULLABLE archive_bytes, size_t archive_length,
    const char *NITRO_ARCHIVE_NONNULL entry_path,
    const uint8_t *NITRO_ARCHIVE_NULLABLE password, size_t password_length,
    uint64_t limit);
NitroArchiveBytesResult nitro_archive_read_file_entry_v1(
    const char *NITRO_ARCHIVE_NONNULL archive_path,
    const char *NITRO_ARCHIVE_NONNULL entry_path,
    const uint8_t *NITRO_ARCHIVE_NULLABLE password, size_t password_length,
    uint64_t limit);
void nitro_archive_free_bytes_v1(NitroArchiveBytesResult result);

#ifdef __cplusplus
}
#endif

#undef NITRO_ARCHIVE_NULLABLE
#undef NITRO_ARCHIVE_NONNULL

#endif
