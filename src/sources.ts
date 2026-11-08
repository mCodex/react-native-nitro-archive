import type {
	ArchiveBufferSource,
	ArchiveFileSource,
	ArchiveUriSource,
} from "./types/archive";

/**
 * Describes a ZIP at an absolute native path. This helper performs no filesystem access.
 * @param path Absolute path without a file:// prefix.
 * @throws TypeError if path is not absolute.
 * @example
 * const source = fileSource(zipPath)
 */
export function fileSource(path: string): ArchiveFileSource {
	if (!path.startsWith("/")) {
		throw new TypeError("fileSource(path) requires an absolute path.");
	}
	return Object.freeze({ kind: "file", path });
}

/**
 * Describes a ZIP through a platform URI without opening it.
 * @param uri Android content:// document URI or iOS file:// URL.
 * @param options iOS security-scope preference; defaults to auto. Your app owns picker/grant handling.
 * @throws TypeError if uri has no URI scheme.
 */
export function uriSource(
	uri: string,
	options: Pick<ArchiveUriSource, "iosSecurityScope"> = {},
): ArchiveUriSource {
	if (!uri.includes("://")) {
		throw new TypeError("uriSource(uri) requires an absolute URI.");
	}
	return Object.freeze({
		kind: "uri",
		uri,
		iosSecurityScope: options.iosSecurityScope ?? "auto",
	});
}

/**
 * Describes a small ZIP already held in memory, without base64.
 * @param data Binary ZIP contents; use file/URI sources for large archives.
 * @param name Optional diagnostic filename.
 */
export function bufferSource(
	data: ArrayBuffer,
	name?: string,
): ArchiveBufferSource {
	return Object.freeze({ kind: "buffer", data, name });
}
