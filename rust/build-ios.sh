#!/usr/bin/env bash
set -euo pipefail

rust_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
artifact_dir="$rust_dir/artifacts/ios"
target_dir="$rust_dir/target"
library=libnitro_archive_core.a
rust_host=$(rustc -vV | sed -n 's/^host: //p')
objcopy="$(rustc --print sysroot)/lib/rustlib/$rust_host/bin/rust-objcopy"
if [[ ! -x "$objcopy" ]]; then
  echo "Install the Rust llvm-tools component before building the XCFramework." >&2
  exit 2
fi

export IPHONEOS_DEPLOYMENT_TARGET=15.5
export TVOS_DEPLOYMENT_TARGET=15.4

mkdir -p "$artifact_dir"
work=$(mktemp -d "$artifact_dir/.build.XXXXXX")
trap 'rm -rf "$work"' EXIT

for target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios aarch64-apple-tvos aarch64-apple-tvos-sim; do
  cargo build --manifest-path "$rust_dir/Cargo.toml" --target-dir "$target_dir" \
    --locked --release --lib --target "$target"
  mkdir "$work/$target"
  # Preserve Rust's weak symbol flags when stripping Mach-O archive members.
  "$objcopy" --strip-debug --remove-section=__LLVM,__bitcode --remove-section=__LLVM,__cmdline \
    "$target_dir/$target/release/$library" "$work/$target/$library"
done

xcrun lipo -create \
  "$work/aarch64-apple-ios-sim/$library" \
  "$work/x86_64-apple-ios/$library" \
  -output "$work/$library"

framework=NitroArchiveCore.xcframework
xcodebuild -create-xcframework \
  -library "$work/aarch64-apple-ios/$library" \
  -library "$work/$library" \
  -library "$work/aarch64-apple-tvos/$library" \
  -library "$work/aarch64-apple-tvos-sim/$library" \
  -output "$work/$framework"

if [[ -d "$artifact_dir/$framework" ]]; then
  mv "$artifact_dir/$framework" "$work/previous"
fi
if ! mv "$work/$framework" "$artifact_dir/$framework"; then
  if [[ -d "$work/previous" ]]; then
    mv "$work/previous" "$artifact_dir/$framework"
  fi
  exit 1
fi
