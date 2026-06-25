# @mcodex/react-native-nitro-archive

ZIP archive creation, inspection, validation, reading, and extraction for React Native, built on Nitro Modules.

[![Version](https://img.shields.io/npm/v/%40mcodex%2Freact-native-nitro-archive.svg)](https://www.npmjs.com/package/@mcodex/react-native-nitro-archive)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React Native](https://img.shields.io/badge/react--native-0.76%2B-61dafb.svg)](https://reactnative.dev/)
[![Nitro Modules](https://img.shields.io/badge/nitro--modules-0.35%2B-orange.svg)](https://github.com/mrousavy/nitro)

## Status

This package is ZIP-first. It does not try to be a general filesystem wrapper.

| Area | Status |
| --- | --- |
| ZIP reading | In progress |
| ZIP64 metadata | In progress |
| ZIP creation | In progress |
| Selective extraction | In progress |
| Progress and cancellation | In progress |
| Password ZIP support | Not stable |
| TAR, RAR, 7z | Out of scope |

> [!WARNING]
> Treat the current package as pre-1.0. APIs can still change while iOS, Android, and TypeScript behavior are brought into parity.

## Requirements

- React Native 0.76 or newer
- Node.js 18 or newer
- `react-native-nitro-modules`
- iOS 15 or newer
- Android API level supported by your React Native version

## Installation

```sh
yarn add @mcodex/react-native-nitro-archive react-native-nitro-modules
```

```sh
npm install @mcodex/react-native-nitro-archive react-native-nitro-modules
```

For iOS:

```sh
cd ios
bundle exec pod install
```

## Quick Start

Create a ZIP:

```ts
import {
  bufferEntry,
  createArchive,
  fileDestination,
} from '@mcodex/react-native-nitro-archive'

const data = new TextEncoder().encode('hello').buffer

const task = createArchive({
  destination: fileDestination('/tmp/example.zip'),
  entries: [bufferEntry(data, 'hello.txt')],
})

const result = await task.start()
console.log(result.outputBytes)
```

Open and list a ZIP:

```ts
import {
  fileSource,
  openArchive,
} from '@mcodex/react-native-nitro-archive'

const archive = await openArchive(fileSource('/tmp/example.zip'))

try {
  const page = await archive.listEntries({ limit: 100 })
  console.log(page.entries)
} finally {
  archive.dispose()
}
```

Extract selected entries:

```ts
import {
  directoryDestination,
  fileSource,
  openArchive,
} from '@mcodex/react-native-nitro-archive'

const archive = await openArchive(fileSource('/tmp/example.zip'))

try {
  const task = archive.extract({
    destination: directoryDestination('/tmp/example-out'),
    include: ['images/**/*'],
    exclude: ['**/.DS_Store', '**/__MACOSX/**'],
    limits: {
      maxEntries: 10_000,
      maxTotalUncompressedBytes: 2_147_483_648n,
      maxEntryUncompressedBytes: 536_870_912n,
    },
  })

  const removeProgress = task.onProgress((progress) => {
    console.log(progress.percentage, progress.currentEntry)
  })

  try {
    await task.start()
  } finally {
    removeProgress()
    task.dispose()
  }
} finally {
  archive.dispose()
}
```

## Security

Archive extraction is a trust boundary. This package rejects unsafe archive paths by default and keeps extraction bounded.

> [!IMPORTANT]
> ZIP bombs are valid ZIP files designed to exhaust disk, memory, or CPU. Set extraction limits for user-provided archives and keep the defaults unless you have measured input sizes.

Default protections include:

- Reject `..` path traversal.
- Reject absolute POSIX paths, Windows drive paths, UNC paths, and URI-style paths.
- Reject duplicate normalized output paths by default.
- Reject special files and unsafe links by default.
- Enforce entry count, per-entry size, total uncompressed size, path depth, and path byte limits.
- Keep progress listeners scoped to one task instead of using a global event emitter.
- Avoid base64 in the public API.

> [!CAUTION]
> Do not pass archives from untrusted users to extraction with relaxed limits. Validate and inspect first, then extract only the paths you need.

## API Shape

The public TypeScript API uses named constructors instead of raw objects:

- `fileSource(path)`
- `uriSource(uri)`
- `bufferSource(data)`
- `fileDestination(path)`
- `uriDestination(uri)`
- `directoryDestination(path)`
- `directoryUriDestination(uri)`
- `fileEntry(sourcePath, archivePath)`
- `directoryEntry(sourcePath, archivePath)`
- `bufferEntry(data, archivePath)`

Imports are side-effect free. The native Nitro module is created lazily on the first runtime operation.

## Platform Notes

### iOS

- Uses Swift for domain and application code.
- Uses SSZipArchive/minizip for ZIP operations.
- Supports local file paths.
- Security-scoped URL and coordinated access work is still being stabilized.

### Android

- Uses Kotlin for domain and application code.
- Uses Zip4j for ZIP operations.
- Supports local file paths and Android `content://` work is being stabilized.

> [!NOTE]
> Password-protected ZIP files are not part of the stable surface yet. They will be documented after iOS and Android pass the same interoperability and security tests.

## Development

```sh
yarn install
yarn typecheck
yarn test
```

iOS example build:

```sh
cd example/ios
bundle exec pod install
cd ../..
xcodebuild \
  -workspace example/ios/NitroArchiveExample.xcworkspace \
  -scheme NitroArchiveExample \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

## Contributing

Keep changes ZIP-focused. Public API changes start in TypeScript, then Swift and Kotlin follow the same contract.

Do not edit generated Nitro files by hand. Change the specs, regenerate, and commit the generated output only when it matches the specs.

Security fixes are welcome. If you find a path traversal, symlink, ZIP bomb, permission, or data-loss issue, open a private report when possible.

## License

MIT
