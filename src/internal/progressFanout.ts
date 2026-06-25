import type { ArchiveProgress, ArchiveProgressListener } from '../types/task'

export class ProgressFanout {
  private listeners = new Set<ArchiveProgressListener>()
  private disposed = false

  add(listener: ArchiveProgressListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(progress: ArchiveProgress): void {
    if (this.disposed) return
    for (const listener of this.listeners) {
      try { listener(progress) } catch (e) {
        if (typeof console !== 'undefined') {
          console.warn('[ArchiveProgress] Listener threw:', e)
        }
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }

  get size(): number {
    return this.listeners.size
  }
}
