import type { HybridObject } from 'react-native-nitro-modules'
import type {
  NativeProgress,
  NativeExtractionResult,
  NativeCreationResult,
  NativeValidationResult,
} from './NativeArchiveTypes.nitro'

export interface NativeCreationTask
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  readonly state: string
  readonly progress: NativeProgress
  start(): Promise<NativeCreationResult>
  cancel(): boolean
  onProgress(callback: (progress: NativeProgress) => void): () => void
}

export interface NativeExtractionTask
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  readonly state: string
  readonly progress: NativeProgress
  start(): Promise<NativeExtractionResult>
  cancel(): boolean
  onProgress(callback: (progress: NativeProgress) => void): () => void
}

export interface NativeValidationTask
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  readonly state: string
  readonly progress: NativeProgress
  start(): Promise<NativeValidationResult>
  cancel(): boolean
  onProgress(callback: (progress: NativeProgress) => void): () => void
}
