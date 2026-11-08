# Open platform documents and use Expo

Your app owns document selection and access grants. The archive library does not open a picker, display permission dialogs or add broad storage access for you.

## Choose a source

Use `fileSource(absolutePath)` for a native local path. It does not accept a `file://` URL. Use `uriSource(uri)` for a platform URI, and check `getArchiveCapabilities().supportsInputUris` before offering that workflow.

```ts
import {
  checkArchiveAccess,
  getArchiveCapabilities,
  openArchive,
  uriSource,
} from 'react-native-nitro-archive'

async function inspectSelectedDocument(selectedUri: string) {
  if (!getArchiveCapabilities().supportsInputUris) {
    throw new Error('This build does not advertise URI input.')
  }

  const source = uriSource(selectedUri)
  const access = await checkArchiveAccess(source, 'read')

  if (!access.accessible) {
    return { recoveryAction: access.recoveryAction }
  }

  const archive = await openArchive(source)
  try {
    return await archive.listEntries({ limit: 100 })
  } finally {
    archive.dispose()
  }
}
```

Preflight is advisory. Handle failures when the operation runs as well: a grant can be revoked or a provider can become unavailable after preflight.

## Android document grants

Your app launches the Storage Access Framework picker and passes its returned `content://` document URI to `uriSource()`. For extraction directory URIs, your app selects a document tree rather than an individual document. Check `supportsOutputUris` and `supportsDirectoryUris` separately; input support does not imply output support.

If the picker offers a persistable grant and your app needs access after restart, your host Android code must explicitly retain the granted read/write flags with `ContentResolver.takePersistableUriPermission`. Retain only flags the picker actually granted. Storing the URI string alone does not retain permission.

Persisted grants can be revoked. Offer document reselection when access is lost. Provider capabilities also affect seeking, child creation, renaming and atomic replacement; inspect the operation result rather than assuming local-file guarantees.

## iOS document URLs

Your app obtains the selected `file://` URL from its document picker. Pass it with `uriSource(selectedUrl, { iosSecurityScope: 'auto' })`. `required` requests failure when scoped access cannot be acquired; `disabled` avoids acquiring scope.

Do not release picker-managed access before the archive operation has acquired the access it needs. Keep readers alive until their operations finish, then dispose them. A URL string is not a durable security-scoped bookmark. Security-scoped and coordinated access are subject to the [compatibility status](compatibility.md).

| Target | Host app responsibility |
| --- | --- |
| App-private native path | Supply a readable input or writable output path |
| Android document URI | Hold a matching URI grant; retain it explicitly when needed |
| Android document tree | Hold a tree grant and handle provider restrictions |
| iOS external file URL | Own picker flow and balance the access lifetime |

The package does not implicitly request `MANAGE_EXTERNAL_STORAGE`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` or Android media permissions. A host app with unrelated features remains responsible for its own manifest and prompts.

## Build with Expo

Expo Go contains a fixed set of native modules. To load this library and Nitro Modules, create your own development build with an Expo SDK that supports the React Native version in your app.

1. Install the package and its Nitro peer in the Expo app.
2. Install the SDK-compatible development client with `npx expo install expo-dev-client`.
3. Build with `npx expo run:android` or `npx expo run:ios` and use that development build.
4. Rebuild the native app after changing native dependencies.

Autolinking and prebuild integration need validation against a packed release of this library. No Expo SDK is advertised as tested until those consumer builds and archive workflows pass. A config plugin is warranted only if a required setting cannot be handled by autolinking; there is no documented plugin to add at this stage.

References: [Expo third-party libraries](https://docs.expo.dev/workflow/using-libraries/), [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Android shared documents](https://developer.android.com/training/data-storage/shared/documents-files), [Apple security-scoped access](https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource()).
