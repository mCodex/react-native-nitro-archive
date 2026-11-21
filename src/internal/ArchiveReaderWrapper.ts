import { ArchiveError } from "../errors";
import type { ArchiveReader } from "../public/ArchiveReader";
import type { NativeArchiveReader } from "../specs/NativeArchiveReader.nitro";
import type { ArchiveFormat } from "../types/archive";
import type { ExtractArchiveOptions } from "../types/extraction";
import type { ValidateArchiveOptions } from "../types/validation";
import { assertInteger, toNativeByteCount } from "./assertions";
import { ExtractionTaskWrapper } from "./ExtractionTaskWrapper";
import {
	mapEntry,
	mapEntryPage,
	mapExtractionOptions,
	mapValidationOptions,
} from "./nativeAdapter";
import { throwNativeFailure } from "./outcome";
import { ValidationTaskWrapper } from "./ValidationTaskWrapper";

export class ArchiveReaderWrapper implements ArchiveReader {
	constructor(private native: NativeArchiveReader) {}

	get format() {
		return this.native.format as ArchiveFormat;
	}

	get entryCount() {
		return this.native.entryCount;
	}

	get compressedSize() {
		return this.native.compressedSize != null
			? BigInt(this.native.compressedSize)
			: undefined;
	}

	get totalUncompressedSize() {
		return this.native.totalUncompressedSize != null
			? BigInt(this.native.totalUncompressedSize)
			: undefined;
	}

	get encrypted() {
		return this.native.encrypted;
	}

	get comment() {
		return this.native.comment ?? undefined;
	}

	async listEntries(
		options?: import("../types/archive").ListArchiveEntriesOptions,
	) {
		assertInteger(options?.offset ?? 0, "offset", 0);
		assertInteger(options?.limit ?? 250, "limit", 1, 2000);

		return mapEntryPage(
			await this.native.listEntries(
				options?.offset ?? 0,
				options?.limit ?? 250,
				options?.prefix ?? undefined,
				options?.kinds != null
					? ([...options.kinds] as readonly string[])
					: undefined,
			),
		);
	}

	async getEntry(path: string) {
		const entry = await this.native.getEntry(path);
		return entry != null ? mapEntry(entry) : undefined;
	}

	async readEntry(
		path: string,
		options: { maxBytes: bigint; password?: string; verifyChecksum?: boolean },
	) {
		const maxBytes = toNativeByteCount(options.maxBytes, "maxBytes");
		if (maxBytes === undefined) throw new TypeError("maxBytes is required.");

		const outcome = await this.native.readEntry(
			path,
			maxBytes,
			options.password,
			options.verifyChecksum,
		);
		throwNativeFailure(outcome.error);
		if (outcome.data == null) {
			throw new ArchiveError("E_INTERNAL", "Archive entry data is missing.");
		}
		return outcome.data;
	}

	extract(options: ExtractArchiveOptions) {
		const request = mapExtractionOptions(options);
		const task = this.native.startExtraction(request);
		return new ExtractionTaskWrapper(task, options);
	}

	validate(options?: ValidateArchiveOptions) {
		const request = mapValidationOptions(options ?? {});
		const task = this.native.startValidation(request);
		return new ValidationTaskWrapper(task, options);
	}

	dispose() {
		this.native.dispose();
	}
}
