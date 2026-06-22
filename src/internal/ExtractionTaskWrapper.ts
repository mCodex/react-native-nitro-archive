import type { NativeExtractionTask } from '../specs/NativeArchiveTasks.nitro'
import type { ArchiveTask, ArchiveProgressListener, ArchiveTaskState, ArchiveProgress } from '../types/task'
import type { ExtractionResult, ExtractArchiveOptions } from '../types/extraction'
import { mapProgress, mapExtractionResult } from './nativeAdapter'
import { ProgressFanout } from './progressFanout'
import { ArchiveError } from '../errors'

export class ExtractionTaskWrapper implements ArchiveTask<ExtractionResult> {
  readonly id: string
  private fanout = new ProgressFanout()
  private started = false
  private _progress: ArchiveProgress
  private nativeDispose: () => void

  constructor(
    private native: NativeExtractionTask,
    private options: ExtractArchiveOptions,
  ) {
    this.id = `extract-${Math.random().toString(36).slice(2, 10)}`
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

  async start(): Promise<ExtractionResult> {
    if (this.started) {
      throw new ArchiveError('E_INVALID_STATE', 'Task has already been started')
    }
    this.started = true
    const result = await this.native.start()
    return mapExtractionResult(result, this.options.destination)
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
