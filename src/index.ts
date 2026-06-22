import { NitroModules } from 'react-native-nitro-modules'
import type { NitroArchive as NitroArchiveSpec } from './specs/nitro-archive.nitro'

export const NitroArchive =
  NitroModules.createHybridObject<NitroArchiveSpec>('NitroArchive')