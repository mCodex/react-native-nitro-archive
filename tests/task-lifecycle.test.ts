import { CreationTaskWrapper } from '../src/internal/CreationTaskWrapper'
import { ExtractionTaskWrapper } from '../src/internal/ExtractionTaskWrapper'
import { ValidationTaskWrapper } from '../src/internal/ValidationTaskWrapper'
import type { NativeCreationTask, NativeExtractionTask, NativeValidationTask } from '../src/specs/NativeArchiveTasks.nitro'
import type { NativeProgress } from '../src/specs/NativeArchiveTypes'

const progress: NativeProgress = { operationId: 'native-operation', phase: 'preparing', processedBytes: 0, processedEntries: 0 }

describe.each(['create', 'extract', 'validate'] as const)('%s task lifecycle', (kind) => {
  function setup() {
    let callback: (p: NativeProgress) => void = () => {}
    const remove = jest.fn()
    const native = { progress, state: 'idle', start: jest.fn(), cancel: jest.fn(() => true), onProgress: jest.fn((listener: typeof callback) => { callback = listener; return remove }) }
    const task = kind === 'create'
      ? new CreationTaskWrapper(native as unknown as NativeCreationTask, { destination: { kind: 'file', path: '/a.zip' }, entries: [] })
      : kind === 'extract'
        ? new ExtractionTaskWrapper(native as unknown as NativeExtractionTask, { destination: { kind: 'directory', path: '/out' } })
        : new ValidationTaskWrapper(native as unknown as NativeValidationTask)
    return { task, native, remove, emit: (p: NativeProgress) => callback(p) }
  }

  it('uses the same operation ID in the task and progress', () => {
    const { task } = setup()
    expect(task.id).toBe('native-operation')
    expect(task.progress.operationId).toBe(task.id)
  })

  it('releases listeners only once and ignores late native callbacks', () => {
    const { task, remove, emit } = setup()
    const listener = jest.fn()
    task.onProgress(listener)
    const before = task.progress
    task.dispose()
    task.dispose()
    emit({ ...progress, processedBytes: 9 })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()
    expect(task.progress).toBe(before)
  })

  it('cannot start after disposal', async () => {
    const { task, native } = setup()
    task.dispose()
    await expect(task.start()).rejects.toMatchObject({ code: 'E_DISPOSED' })
    expect(native.start).not.toHaveBeenCalled()
    expect(task.cancel()).toBe(false)
  })
})
