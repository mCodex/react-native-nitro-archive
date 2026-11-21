#include <jni.h>
#include <fcntl.h>
#include <linux/fs.h>
#include <sys/syscall.h>
#include <unistd.h>

#include <cerrno>

#include <cstring>
#include <limits>
#include <memory>

#include "nitro_archive_core.h"

namespace {

class BorrowedByteArray {
 public:
  BorrowedByteArray(JNIEnv* env, jbyteArray array)
      : env_(env),
        array_(array),
        length_(array == nullptr ? 0 : env->GetArrayLength(array)),
        bytes_(length_ == 0 ? nullptr : env->GetByteArrayElements(array, nullptr)) {}

  BorrowedByteArray(const BorrowedByteArray&) = delete;
  BorrowedByteArray& operator=(const BorrowedByteArray&) = delete;

  ~BorrowedByteArray() {
    if (bytes_ != nullptr) {
      env_->ReleaseByteArrayElements(array_, bytes_, JNI_ABORT);
    }
  }

  bool valid() const { return length_ == 0 || bytes_ != nullptr; }
  size_t length() const { return static_cast<size_t>(length_); }
  const uint8_t* bytes() const { return reinterpret_cast<const uint8_t*>(bytes_); }

 private:
  JNIEnv* env_;
  jbyteArray array_;
  jsize length_;
  jbyte* bytes_;
};

jbyteArray copyBytes(JNIEnv* env, const void* bytes, size_t length) {
  if (length > static_cast<size_t>(std::numeric_limits<jsize>::max()) ||
      (length > 0 && bytes == nullptr)) {
    return nullptr;
  }

  const auto outputLength = static_cast<jsize>(length);
  jbyteArray output = env->NewByteArray(outputLength);
  if (output != nullptr && outputLength > 0) {
    env->SetByteArrayRegion(output, 0, outputLength, static_cast<const jbyte*>(bytes));
  }
  return output;
}

}  // namespace

extern "C" JNIEXPORT jbyteArray JNICALL
Java_dev_modex_nitroarchive_infrastructure_zip_RustZipArchive_inspectBytes(
    JNIEnv* env, jobject, jbyteArray data) {
  char* json = nullptr;
  {
    BorrowedByteArray input(env, data);
    if (!input.valid()) {
      return nullptr;
    }
    json = nitro_archive_inspect_v1(input.bytes(), input.length());
  }

  std::unique_ptr<char, decltype(&nitro_archive_free_json_v1)> result(
      json, nitro_archive_free_json_v1);
  return result ? copyBytes(env, result.get(), std::strlen(result.get())) : nullptr;
}

extern "C" JNIEXPORT jobject JNICALL
Java_dev_modex_nitroarchive_infrastructure_zip_RustZipArchive_readBytes(
    JNIEnv* env, jobject, jbyteArray data, jbyteArray path, jbyteArray password, jlong limit) {
  NitroArchiveBytesResult result{};
  {
    BorrowedByteArray input(env, data);
    if (!input.valid()) {
      return nullptr;
    }

    BorrowedByteArray entryPath(env, path);
    if (!entryPath.valid() || entryPath.length() == 0 ||
        entryPath.bytes()[entryPath.length() - 1] != 0 || limit < 0) {
      return nullptr;
    }

    BorrowedByteArray secret(env, password);
    if (!secret.valid()) {
      return nullptr;
    }
    result = nitro_archive_read_entry_v1(
        input.bytes(), input.length(), reinterpret_cast<const char*>(entryPath.bytes()),
        secret.bytes(), secret.length(), static_cast<uint64_t>(limit));
  }

  jbyteArray bytes = result.error == nullptr ? copyBytes(env, result.bytes, result.length) : nullptr;
  jstring error = result.error != nullptr ? env->NewStringUTF(result.error) : nullptr;
  nitro_archive_free_bytes_v1(result);

  if (env->ExceptionCheck() || (bytes == nullptr && error == nullptr)) {
    return nullptr;
  }

  jclass type = env->FindClass("dev/modex/nitroarchive/infrastructure/zip/RustZipArchive$ReadResult");
  if (type == nullptr) {
    return nullptr;
  }

  jmethodID constructor = env->GetMethodID(type, "<init>", "([BLjava/lang/String;)V");
  return constructor == nullptr ? nullptr : env->NewObject(type, constructor, bytes, error);
}

namespace {

struct ProgressContext {
  JNIEnv* env;
  jobject sink;
  jmethodID update;
};

int32_t updateProgress(void* data, uint64_t bytes, uint64_t entries) {
  auto& ctx = *static_cast<ProgressContext*>(data);
  const jboolean cancel = ctx.env->CallBooleanMethod(
      ctx.sink, ctx.update, static_cast<jlong>(bytes), static_cast<jlong>(entries));
  return ctx.env->ExceptionCheck() || cancel == JNI_TRUE ? 1 : 0;
}

jbyteArray encodeJson(JNIEnv* env, char* json) {
  std::unique_ptr<char, decltype(&nitro_archive_free_json_v1)> result(
      json, nitro_archive_free_json_v1);
  return result && !env->ExceptionCheck()
      ? copyBytes(env, result.get(), std::strlen(result.get()))
      : nullptr;
}

}  // namespace

extern "C" JNIEXPORT jbyteArray JNICALL
Java_dev_modex_nitroarchive_infrastructure_zip_RustZipArchive_detectBytes(
    JNIEnv* env, jobject, jbyteArray data) {
  BorrowedByteArray input(env, data);
  return input.valid() ? encodeJson(env, nitro_archive_detect_v1(input.bytes(), input.length())) : nullptr;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_dev_modex_nitroarchive_infrastructure_zip_RustZipArchive_detectPath(
    JNIEnv* env, jobject, jbyteArray path) {
  BorrowedByteArray input(env, path);
  if (!input.valid() || input.length() == 0 || input.bytes()[input.length() - 1] != 0) {
    return nullptr;
  }
  return encodeJson(env, nitro_archive_detect_file_v1(reinterpret_cast<const char*>(input.bytes())));
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_dev_modex_nitroarchive_infrastructure_zip_RustZipArchive_runOperation(
    JNIEnv* env, jobject, jbyteArray request, jbyteArray password, jobject sink) {
  const jclass type = env->GetObjectClass(sink);
  if (type == nullptr) {
    return nullptr;
  }
  const auto update = env->GetMethodID(type, "update", "(JJ)Z");
  if (update == nullptr) {
    return nullptr;
  }
  ProgressContext context{env, sink, update};
  char* json = nullptr;
  {
    BorrowedByteArray encoded(env, request);
    if (!encoded.valid() || encoded.length() == 0 || encoded.bytes()[encoded.length() - 1] != 0) {
      return nullptr;
    }
    BorrowedByteArray secret(env, password);
    if (!secret.valid()) {
      return nullptr;
    }
    json = nitro_archive_operation_v1(
        reinterpret_cast<const char*>(encoded.bytes()), secret.bytes(), secret.length(),
        updateProgress, &context);
  }
  return encodeJson(env, json);
}

extern "C" JNIEXPORT jint JNICALL
Java_dev_modex_nitroarchive_infrastructure_zip_RustZipArchive_openDirectoryPath(
    JNIEnv* env, jobject, jbyteArray path) {
  BorrowedByteArray input(env, path);
  if (!input.valid() || input.length() == 0 || input.bytes()[input.length() - 1] != 0) {
    return -EINVAL;
  }
  const int descriptor = open(reinterpret_cast<const char*>(input.bytes()),
                              O_PATH | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  return descriptor >= 0 ? descriptor : -errno;
}

namespace {

bool isLeafName(const BorrowedByteArray& input) {
  if (!input.valid() || input.length() < 2 || input.bytes()[input.length() - 1] != 0) {
    return false;
  }
  const size_t length = input.length() - 1;
  const auto* name = reinterpret_cast<const char*>(input.bytes());
  return std::memchr(name, 0, length) == nullptr && std::memchr(name, '/', length) == nullptr &&
         std::strcmp(name, ".") != 0 && std::strcmp(name, "..") != 0;
}

}  // namespace

extern "C" JNIEXPORT jint JNICALL
Java_dev_modex_nitroarchive_infrastructure_zip_RustZipArchive_renameDirectoryEntry(
    JNIEnv* env, jobject, jint directory, jbyteArray from, jbyteArray to, jboolean exchange) {
  BorrowedByteArray source(env, from);
  if (!isLeafName(source)) {
    return -EINVAL;
  }
  BorrowedByteArray target(env, to);
  if (!isLeafName(target)) {
    return -EINVAL;
  }
  const unsigned flags = exchange == JNI_TRUE ? RENAME_EXCHANGE : RENAME_NOREPLACE;
  const long result = syscall(SYS_renameat2, directory, source.bytes(),
                              directory, target.bytes(), flags);
  return result == 0 ? 0 : -errno;
}
