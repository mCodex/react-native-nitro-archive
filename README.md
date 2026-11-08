# react-native-nitro-archive

ZIP creation, inspection, bounded reads and extraction for React Native, powered by Nitro Modules. Archive work runs in Swift and Kotlin; binary inputs use paths, URIs or `ArrayBuffer`.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> [!WARNING]
> This package is pre-1.0. Native compatibility, external-document access and the security conformance suite are being completed. Review the [compatibility notes](docs/compatibility.md) before adopting it for untrusted archives.

## 📦 Install

```sh
yarn add react-native-nitro-archive react-native-nitro-modules
```

For iOS, run `bundle exec pod install` in your app’s `ios` directory, then rebuild the app. React Native and Nitro Modules are peer dependencies; use a compatible pair for your app.

**Expo requires a development build.** This package contains custom native code and does not run in the standard Expo Go app. See [Expo and platform access](docs/platform-access.md).

## Open and extract a ZIP

The paths below are absolute paths inside your app’s writable storage. Your app supplies them; the library does not pick files or request permissions.

```ts
import {
  directoryDestination,
  fileSource,
  openArchive,
} from 'react-native-nitro-archive'

async function extractPhotos(zipPath: string, outputDirectory: string) {
  const archive = await openArchive(fileSource(zipPath))

  try {
    const page = await archive.listEntries({ limit: 100 })
    console.log(page.entries.map((entry) => entry.path))

    const task = archive.extract({
      destination: directoryDestination(outputDirectory),
      include: ['photos/**/*'],
      exclude: ['**/.DS_Store'],
    })
    const unsubscribe = task.onProgress((progress) => {
      console.log(progress.percentage, progress.currentEntry)
    })

    try {
      return await task.start()
    } finally {
      unsubscribe()
      task.dispose()
    }
  } finally {
    archive.dispose()
  }
}
```

A task starts once. Call `task.cancel()` to request cooperative cancellation; await `start()` settling before releasing resources. Operations are process-bound and do not survive app termination.

## Create a ZIP

```ts
import {
  createArchive,
  fileDestination,
  fileEntry,
} from 'react-native-nitro-archive'

async function zipReport(reportPath: string, zipPath: string) {
  const task = createArchive({
    destination: fileDestination(zipPath),
    entries: [fileEntry(reportPath, 'report.pdf')],
    compression: { profile: 'balanced' },
  })

  try {
    return await task.start()
  } finally {
    task.dispose()
  }
}
```

Use `directoryEntry()` for directories and `bufferEntry()` for small binary contents. Existing-output policy defaults to `error`; check `atomicWriteApplied` in results before relying on atomic replacement.

## 🔒 Handle untrusted input

Keep restrictive extraction limits. The contract defaults are 10,000 entries, 2 GiB total output, 512 MiB per entry, compression ratio 1,000, depth 32 and path length 1,024 UTF-8 bytes. Validation does not reserve disk space or make a later extraction immune to changes in storage or access.

ZIP is the only exposed archive format. Encryption identifiers in TypeScript do not establish interoperability: consult `getArchiveCapabilities()` and verify both platforms before accepting password-protected archives. Passwords do not protect against malicious archive contents.

```ts
import { isArchiveError } from 'react-native-nitro-archive'
import type { ArchiveTask } from 'react-native-nitro-archive/types'

async function runTask(task: ArchiveTask<unknown>) {
  try {
    return await task.start()
  } catch (error) {
    if (isArchiveError(error)) {
      console.error(error.code)
    }
    throw error
  }
}
```

Branch on error codes, not message text. Avoid logging passwords or document contents. See [security and limits](docs/security-and-limits.md) and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Learn more

- [Platform access, URI grants and Expo](docs/platform-access.md)
- [Compatibility, imports and bundle size](docs/compatibility.md)
- [Format-extension assessment](docs/formats.md)
- [Implementation plan and verification gates](IMPLEMENTATION_PLAN.md)

Use root named exports for the core API. Pure constructors also have subpaths such as `react-native-nitro-archive/sources`; React hooks live under `react-native-nitro-archive/react`. Hover documentation describes options, units and lifecycle requirements.

## Contribute

Public changes start in TypeScript. Keep Swift and Kotlin behavior aligned, add regression tests for safety fixes, and regenerate Nitro bindings rather than editing generated files. Run the repository’s typecheck, tests, build and native verification before proposing a release.

[MIT](LICENSE). Native engine dependencies retain their own licenses.
