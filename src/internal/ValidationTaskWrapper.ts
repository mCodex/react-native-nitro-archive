import type { NativeValidationTask } from '../specs/NativeArchiveTasks.nitro'
import type { ArchiveTask, ArchiveProgressListener, ArchiveTaskState, ArchiveProgress } from '../types/task'
import type { ValidationResult, ValidateArchiveOptions } from '../types/validation'
import { mapProgress, mapValidationResult } from './nativeAdapter'
import { ProgressFanout } from './progressFanout'
import { ArchiveError } from '../errors'

export class ValidationTaskWrapper implements ArchiveTask<ValidationResult> {
  readonly id: string
  private fanout = new ProgressFanout()
  private started = false
  private _progress: ArchiveProgress
  private nativeDispose: () => void

  constructor(
    private native: NativeValidationTask,
    _options?: ValidateArchiveOptions,
  ) {
    this.id = `validate-${Math.random().toString(36).slice(2, 10)}`
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

  async start(): Promise<ValidationResult> {
    if (this.started) {
      throw new ArchiveError('E_INVALID_STATE', 'Task has already been started')
    }
    this.started = true
    const result = await this.native.start()
    return mapValidationResult(result)
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
