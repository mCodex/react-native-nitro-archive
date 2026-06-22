import { useSyncExternalStore } from 'react'
import type { ArchiveProgress, ArchiveTask } from '../types/task'

export function useArchiveProgress(
  task: ArchiveTask<unknown> | undefined,
): ArchiveProgress | undefined {
  const subscribe = (onStoreChange: () => void) => {
    if (!task) return () => {}
    const unsubscribe = task.onProgress(onStoreChange)
    return unsubscribe
  }
  const getSnapshot = () => task?.progress
  const getServerSnapshot = () => undefined
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
