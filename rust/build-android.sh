#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 /path/to/android/ndk [arm64-v8a armeabi-v7a x86 x86_64]" >&2
  exit 2
fi

ndk=$(cd "$1" && pwd)
shift
if [ "$#" -eq 0 ]; then
  set -- arm64-v8a armeabi-v7a x86 x86_64
fi

rust_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for bin in "$ndk"/toolchains/llvm/prebuilt/*/bin; do
  if [ -d "$bin" ]; then break; fi
done

for abi in "$@"; do
  case "$abi" in
    arm64-v8a) target=aarch64-linux-android; clang_target=$target ;;
    armeabi-v7a) target=armv7-linux-androideabi; clang_target=armv7a-linux-androideabi ;;
    x86) target=i686-linux-android; clang_target=$target ;;
    x86_64) target=x86_64-linux-android; clang_target=$target ;;
    *) echo "Unsupported Android ABI: $abi" >&2; exit 2 ;;
  esac

  linker="$bin/${clang_target}24-clang"
  if [ ! -x "$linker" ]; then
    echo "Android NDK linker unavailable: $linker" >&2
    exit 2
  fi

  cargo_target=$(printf '%s' "$target" | tr '[:lower:]-' '[:upper:]_')
  env "CARGO_TARGET_${cargo_target}_LINKER=$linker" cargo build \
    --manifest-path "$rust_dir/Cargo.toml" --target-dir "$rust_dir/target" \
    --release --locked --target "$target"

  output="$rust_dir/artifacts/android/$abi"
  mkdir -p "$output"
  artifact=$(mktemp "$output/.libnitro_archive_core.XXXXXX")
  trap 'rm -f "$artifact"' EXIT
  "$bin/llvm-strip" --strip-debug -o "$artifact" "$rust_dir/target/$target/release/libnitro_archive_core.a"
  chmod 644 "$artifact"
  mv "$artifact" "$output/libnitro_archive_core.a"
  trap - EXIT
done
