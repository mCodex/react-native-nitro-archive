import type { NativeCreationTask } from '../specs/NativeArchiveTasks.nitro'
import type { ArchiveTask, ArchiveProgressListener, ArchiveTaskState, ArchiveProgress } from '../types/task'
import type { CreationResult, CreateArchiveOptions } from '../types/creation'
import { mapProgress, mapCreationResult } from './nativeAdapter'
import { ProgressFanout } from './progressFanout'
import { ArchiveError } from '../errors'

export class CreationTaskWrapper implements ArchiveTask<CreationResult> {
  readonly id: string
  private fanout = new ProgressFanout()
  private started = false
  private _progress: ArchiveProgress
  private nativeDispose: () => void

  constructor(
    private native: NativeCreationTask,
    private options: CreateArchiveOptions,
  ) {
    this.id = `create-${Math.random().toString(36).slice(2, 10)}`
    this._progress = mapProgress(native.progress)

    this.nativeDispose = this.native.onProgress((p) => {
      const mapped = mapProgress(p)
      this._progress = mapped
      this.fanout.emit(mapped)
    })
  }

  get state(): ArchiveTaskState {
    return this.native.state as ArchiveTaskState
  }

  get progress(): ArchiveProgress {
    return this._progress
  }

  async start(): Promise<CreationResult> {
    if (this.started) {
      throw new ArchiveError('E_INVALID_STATE', 'Task has already been started')
    }
    this.started = true
    const result = await this.native.start()
    return mapCreationResult(result, this.options.destination)
  }

  cancel(): boolean {
    return this.native.cancel()
  }

  onProgress(listener: ArchiveProgressListener): () => void {
    return this.fanout.add(listener)
  }

  dispose(): void {
    this.nativeDispose()
    this.fanout.dispose()
  }
}
