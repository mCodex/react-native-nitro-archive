import { CreationTaskWrapper } from "./internal/CreationTaskWrapper";
import { getNativeArchiveModule } from "./internal/getNativeModule";
import { mapCreationOptions } from "./internal/nativeAdapter";
import type { CreateArchiveOptions, CreationResult } from "./types/creation";
import type { ArchiveTask } from "./types/task";

/**
 * Creates a single-use ZIP creation task without starting it.
 * @param options Output location, entries and optional compression/output policy.
 * @returns A task; call start() once and dispose() when finished.
 * @throws ArchiveError for invalid or unsupported encryption settings.
 * @example
 * const task = createArchive({
 *   destination: fileDestination(outputPath),
 *   entries: [fileEntry(inputPath, "report.pdf")],
 * })
 * try {
 *   const result = await task.start()
 *   console.log(result.outputBytes)
 * } finally {
 *   task.dispose()
 * }
 */
export function createArchive(
	options: CreateArchiveOptions,
): ArchiveTask<CreationResult> {
	const module = getNativeArchiveModule();
	const request = mapCreationOptions(options);
	const nativeTask = module.create(request);
	return new CreationTaskWrapper(nativeTask, options);
}
