#include <jni.h>
#include <fbjni/fbjni.h>

// The Android NDK defines ANDROID as a preprocessor macro, but the
// generated NativePlatform.hpp uses ANDROID as an enum value. Undefine
// it before including the generated headers to avoid the collision.
#ifdef ANDROID
#undef ANDROID
#endif

#include "NitroArchiveOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::archive::registerAllNatives();
  });
}