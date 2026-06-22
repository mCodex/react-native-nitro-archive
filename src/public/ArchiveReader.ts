import type { ArchiveEntry, ArchiveEntryPage, ArchiveFormat } from '../types/archive'
import type { ListArchiveEntriesOptions } from '../types/archive'
import type { ExtractArchiveOptions, ExtractionResult } from '../types/extraction'
import type { ValidateArchiveOptions, ValidationResult } from '../types/validation'
import type { ArchiveTask } from '../types/task'

export interface ArchiveReader {
  readonly format: ArchiveFormat
  readonly entryCount: number
  readonly compressedSize?: bigint
  readonly totalUncompressedSize?: bigint
  readonly encrypted: boolean
  readonly comment?: string

  listEntries(options?: ListArchiveEntriesOptions): Promise<ArchiveEntryPage>
  getEntry(path: string): Promise<ArchiveEntry | undefined>
  readEntry(path: string, options: { maxBytes: bigint; password?: string; verifyChecksum?: boolean }): Promise<ArrayBuffer>
  extract(options: ExtractArchiveOptions): ArchiveTask<ExtractionResult>
  validate(options?: ValidateArchiveOptions): ArchiveTask<ValidationResult>
  dispose(): void
}
