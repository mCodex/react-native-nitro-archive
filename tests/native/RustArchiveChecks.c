// Android device smoke test for the same Rust ABI used by JNI.
#include "nitro_archive_core.h"

#include <assert.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static const uint8_t payload[] = {0, 1, 2, 3, 4, 0, 255};

static void check_json(char *result, const char *expected) {
  if (result == NULL || strstr(result, expected) == NULL) {
    fprintf(stderr, "Expected %s, got %s\n", expected, result ? result : "NULL");
    abort();
  }
  nitro_archive_free_json_v1(result);
}

static void make_path(char *path, size_t size, const char *directory,
                      const char *name) {
  int count = snprintf(path, size, "%s/%s", directory, name);
  assert(count >= 0 && (size_t)count < size);
}

static int new_file(const char *path) {
  int fd = open(path, O_CREAT | O_EXCL | O_NOFOLLOW | O_RDWR, 0600);
  assert(fd >= 0);
  return fd;
}

static int32_t cancel_after_read(void *context, uint64_t bytes, uint64_t entries) {
  (void)context;
  (void)entries;
  return bytes > 0;
}

static void round_trip(const char *directory, const char *source,
                       const char *format, const char *encryption) {
  char archive[512], output[512], request[2048], expected[128];
  make_path(archive, sizeof archive, directory, format);
  int fd = new_file(archive);
  const uint8_t *password = encryption ? (const uint8_t *)"test-password" : NULL;
  size_t password_len = password ? strlen((const char *)password) : 0;

  int count = snprintf(request, sizeof request,
      "{\"operation\":\"create\",\"format\":\"%s\",\"outputFd\":%d,"
      "\"encryptionMethod\":\"%s\",\"entries\":[{\"kind\":\"file\","
      "\"path\":\"payload.bin\",\"sourcePath\":\"%s\"}]}",
      format, fd, encryption ? encryption : "none", source);
  assert(count >= 0 && (size_t)count < sizeof request);
  check_json(nitro_archive_operation_v1(request, password, password_len, NULL, NULL),
             "\"entryCount\":1");
  assert(close(fd) == 0);

  count = snprintf(expected, sizeof expected, "\"format\":\"%s\"", format);
  assert(count >= 0 && (size_t)count < sizeof expected);
  check_json(nitro_archive_detect_file_v1(archive), expected);

  NitroArchiveBytesResult read = nitro_archive_read_file_entry_v1(
      archive, "payload.bin", password, password_len, sizeof payload);
  assert(read.error == NULL && read.length == sizeof payload);
  assert(memcmp(read.bytes, payload, sizeof payload) == 0);
  nitro_archive_free_bytes_v1(read);

  if (password) {
    read = nitro_archive_read_file_entry_v1(
        archive, "payload.bin", (const uint8_t *)"wrong", 5, sizeof payload);
    assert(read.error != NULL && strcmp(read.error, "E_BAD_PASSWORD") == 0);
    assert(read.bytes == NULL);
    nitro_archive_free_bytes_v1(read);
  }

  make_path(output, sizeof output, directory, "verified");
  fd = new_file(output);
  count = snprintf(request, sizeof request,
      "{\"operation\":\"extract\",\"archivePath\":\"%s\","
      "\"entryPath\":\"payload.bin\",\"outputFd\":%d,\"limit\":%zu}",
      archive, fd, sizeof payload);
  assert(count >= 0 && (size_t)count < sizeof request);

  check_json(nitro_archive_operation_v1(request, password, password_len,
                                       cancel_after_read, NULL),
             "\"error\":\"E_OPERATION_CANCELLED\"");
  struct stat info;
  assert(fstat(fd, &info) == 0 && info.st_size == 0);
  check_json(nitro_archive_operation_v1(request, password, password_len, NULL, NULL),
             "\"writtenBytes\":7");
  uint8_t bytes[sizeof payload];
  assert(pread(fd, bytes, sizeof bytes, 0) == sizeof bytes);
  assert(memcmp(bytes, payload, sizeof payload) == 0);
  assert(close(fd) == 0);
  assert(unlink(output) == 0 && unlink(archive) == 0);
}

int main(void) {
  char directory[] = "/data/local/tmp/nitro-v7-XXXXXX";
  assert(mkdtemp(directory) != NULL);
  char source[512];
  make_path(source, sizeof source, directory, "input.bin");
  int fd = new_file(source);
  assert(write(fd, payload, sizeof payload) == sizeof payload);
  assert(close(fd) == 0);

  round_trip(directory, source, "zip", "aes-256");
  round_trip(directory, source, "tar", NULL);
  round_trip(directory, source, "tar.gz", NULL);

  assert(unlink(source) == 0 && rmdir(directory) == 0);
  printf("ZIP AES-256, TAR and TAR.GZ passed on Android (page size %ld).\n",
         sysconf(_SC_PAGESIZE));
  return 0;
}
