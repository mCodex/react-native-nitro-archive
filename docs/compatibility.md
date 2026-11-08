# Check compatibility and bundle behavior

This repository targets React Native 0.88.1 and Nitro Modules/Nitrogen 0.37.2 during implementation. A manifest version is not evidence that all builds or runtime workflows pass. See the implementation plan for the gates still required before a stable release.

| Environment | Support statement |
| --- | --- |
| React Native Android/iOS | Native ZIP implementation exists; migration and security verification are in progress |
| Expo development build/prebuild | Integration path under validation; use an SDK-compatible React Native version |
| Standard Expo Go | Custom native module is unavailable |
| Web, Windows, macOS, tvOS | No tested support claimed |
| RAR, TAR, TAR.GZ, 7z | Not exposed by the public archive-format contract |

The SSZipArchive 2.6 dependency requires iOS 15.5 or tvOS 15.4; the tvOS engine minimum does not establish tvOS library support. The supported host’s React Native requirements can raise those minima.

Do not use a static minimum-version badge to choose a dependency combination. Confirm the minimum OS, native toolchain and React/Nitro peer requirements for the release you install. The app’s React Native version can require a higher OS minimum than the archive podspec itself.

## Keep core imports separate from hooks

```ts
import { openArchive, fileSource } from 'react-native-nitro-archive'
import { bufferSource } from 'react-native-nitro-archive/sources'
import type { ArchiveEntry } from 'react-native-nitro-archive/types'
```

Core exports are imperative. Optional hooks are under `react-native-nitro-archive/react`. Pure source/destination/entry constructors do not open files or instantiate a Hybrid Object. Native archive operations initialize the root module when called.

Published ESM, type-only exports and accurate side-effect metadata let a compatible consumer bundler remove unused JavaScript. TypeScript 7 does not perform that bundler optimization itself. Metro and Expo behavior depends on the bundler version and configuration; do not assume a subpath or named import guarantees a smaller production bundle.

Native engines are a separate size cost. Removing a JavaScript export does not establish that native engine code disappears from an APK, AAB or iOS binary.

## Verify size claims

Compare release consumer builds against the same app without importing the library. Measure types-only imports, one pure helper, a reading workflow, creation and hooks separately. Record toolchain versions, minification settings and retained modules. Report JavaScript, tarball, Hermes bytecode and native binary sizes separately.

No numerical size or speed improvement is claimed here until reproducible consumer measurements exist.

## Troubleshoot setup

- **Native module unavailable:** rebuild the app after installing native dependencies; check Nitro autolinking. Standard Expo Go cannot load this module.
- **iOS linking failure:** install pods for the consumer app and verify compatible Nitro/Nitrogen-generated output.
- **Kotlin extension already registered:** an AGP built-in Kotlin configuration can conflict with explicitly applying the Kotlin Android plugin. Use a release verified with your AGP configuration.
- **Unsupported URI output:** check the relevant capability independently of input URI support; use an app-private path if your workflow allows it.
- **Type imports resolve to private files:** verify you installed a complete tarball, and import only documented root/subpath exports.
