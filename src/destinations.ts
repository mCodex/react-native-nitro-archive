import type {
	ArchivePathDestination,
	ArchiveUriDestination,
	DirectoryPathDestination,
	DirectoryUriDestination,
} from "./types/archive";

/**
 * Describes an output ZIP at an absolute native path without writing it.
 * @param path Absolute path without a file:// prefix.
 * @throws TypeError if path is not absolute.
 */
export function fileDestination(path: string): ArchivePathDestination {
	if (!path.startsWith("/")) {
		throw new TypeError("fileDestination(path) requires an absolute path.");
	}
	return Object.freeze({ kind: "file", path });
}

/**
 * Describes an output ZIP document URI without requesting access.
 * @param uri Writable platform document URI; check native capabilities first.
 * @throws TypeError if uri has no URI scheme.
 */
export function uriDestination(
	uri: string,
	options: Pick<ArchiveUriDestination, "iosSecurityScope"> = {},
): ArchiveUriDestination {
	if (!uri.includes("://")) {
		throw new TypeError("uriDestination(uri) requires an absolute URI.");
	}
	return Object.freeze({
		kind: "uri",
		uri,
		iosSecurityScope: options.iosSecurityScope ?? "auto",
	});
}

/**
 * Describes the absolute directory that will receive extracted entries.
 * @param path Absolute native directory path.
 * @throws TypeError if path is not absolute.
 */
export function directoryDestination(path: string): DirectoryPathDestination {
	if (!path.startsWith("/")) {
		throw new TypeError(
			"directoryDestination(path) requires an absolute path.",
		);
	}
	return Object.freeze({ kind: "directory", path });
}

/**
 * Describes an extraction directory URI without requesting access.
 * @param uri Android SAF tree URI or writable iOS directory URL. Check supportsDirectoryUris first.
 * @throws TypeError if uri has no URI scheme.
 */
export function directoryUriDestination(
	uri: string,
	options: Pick<DirectoryUriDestination, "iosSecurityScope"> = {},
): DirectoryUriDestination {
	if (!uri.includes("://")) {
		throw new TypeError(
			"directoryUriDestination(uri) requires an absolute URI.",
		);
	}
	return Object.freeze({
		kind: "directory-uri",
		uri,
		iosSecurityScope: options.iosSecurityScope ?? "auto",
	});
}
