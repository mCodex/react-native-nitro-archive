# Security policy

This package is pre-1.0. A stable security-support window has not been established. Consult release notes and the compatibility documentation before using a release with untrusted archives.

## Report a vulnerability privately

Use [GitHub’s private vulnerability reporting page](https://github.com/mCodex/react-native-nitro-archive/security/advisories/new) if it is enabled for this repository. If private reporting is unavailable, open a public issue asking for a private contact without including exploit details or sensitive files.

Include the package version, platform, affected operation, expected behavior and the smallest synthetic reproduction. Mention whether the issue can escape an extraction directory, overwrite existing data, bypass resource limits or retain access after disposal. Do not send real user documents, credentials or passwords.

Avoid publishing an exploit until maintainers have had an opportunity to investigate and coordinate a fix. No response deadline is promised here.

## Security boundaries

Archive parsing, path normalization, output creation, link handling, decompression limits, structured errors and cleanup all participate in the security boundary. Tests must cover actual native behavior on Android and iOS; JavaScript mocks alone do not prove extraction safety.

The host app owns document pickers and grants. Access preflight is advisory, and operations must revalidate access when they use it. Background completion and resistance to a compromised operating system are outside this package’s guarantees.
