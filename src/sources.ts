import type {
	ArchiveBufferSource,
	ArchiveFileSource,
	ArchiveUriSource,
} from "./types/archive";

export function fileSource(path: string): ArchiveFileSource {
	if (!path.startsWith("/")) {
		throw new TypeError("fileSource(path) requires an absolute path.");
	}
	return Object.freeze({ kind: "file", path });
}

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

export function bufferSource(
	data: ArrayBuffer,
	name?: string,
): ArchiveBufferSource {
	return Object.freeze({ kind: "buffer", data, name });
}
