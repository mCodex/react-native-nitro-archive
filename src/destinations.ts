import type {
	ArchivePathDestination,
	ArchiveUriDestination,
	DirectoryPathDestination,
	DirectoryUriDestination,
} from "./types/archive";

export function fileDestination(path: string): ArchivePathDestination {
	if (!path.startsWith("/")) {
		throw new TypeError("fileDestination(path) requires an absolute path.");
	}
	return Object.freeze({ kind: "file", path });
}

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

export function directoryDestination(path: string): DirectoryPathDestination {
	if (!path.startsWith("/")) {
		throw new TypeError(
			"directoryDestination(path) requires an absolute path.",
		);
	}
	return Object.freeze({ kind: "directory", path });
}

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
