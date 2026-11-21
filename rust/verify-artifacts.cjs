const { statSync } = require('node:fs')
const { join } = require('node:path')

const artifacts = join(__dirname, 'artifacts')
const library = 'libnitro_archive_core.a'
const xcframework = 'ios/NitroArchiveCore.xcframework'
const requiredFiles = [
  `${xcframework}/Info.plist`,
  ...['ios-arm64', 'ios-arm64_x86_64-simulator', 'tvos-arm64', 'tvos-arm64-simulator']
    .map((slice) => `${xcframework}/${slice}/${library}`),
  ...['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']
    .map((abi) => `android/${abi}/${library}`),
]
const missing = requiredFiles.filter((file) => {
  const artifact = statSync(join(artifacts, file), { throwIfNoEntry: false })
  return !artifact?.isFile() || artifact.size === 0
})

if (missing.length > 0) {
  console.error('Build the Rust artifacts before packing. See rust/README.md.')
  console.error(missing.join('\n'))
  process.exitCode = 1
}
