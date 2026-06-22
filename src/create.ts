import type { ArchiveTask } from './types/task'
import type { CreateArchiveOptions, CreationResult } from './types/creation'
import { getNativeArchiveModule } from './internal/getNativeModule'
import { mapCreationOptions } from './internal/nativeAdapter'
import { CreationTaskWrapper } from './internal/CreationTaskWrapper'

export function createArchive(options: CreateArchiveOptions): ArchiveTask<CreationResult> {
  const module = getNativeArchiveModule()
  const request = mapCreationOptions(options)
  const nativeTask = module.create(request)
  return new CreationTaskWrapper(nativeTask, options)
}
