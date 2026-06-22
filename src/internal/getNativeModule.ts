import { NitroModules } from 'react-native-nitro-modules'
import type { ArchiveModule } from '../specs/ArchiveModule.nitro'

let instance: ArchiveModule | undefined

export function getNativeArchiveModule(): ArchiveModule {
  if (instance === undefined) {
    instance = NitroModules.createHybridObject<ArchiveModule>('ArchiveModule')
  }
  return instance
}
