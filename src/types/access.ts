export type ArchiveAccessMode =
  | 'read'
  | 'write'
  | 'create-children'

export type ArchiveRecoveryAction =
  | 'none'
  | 'choose-document'
  | 'choose-directory'
  | 'reselect-document'
  | 'grant-read-access'
  | 'grant-write-access'
  | 'download-from-provider'
  | 'move-into-app-storage'
  | 'use-content-uri'

export interface ArchiveAccessReport {
  readonly platform: 'ios' | 'android'
  readonly mode: ArchiveAccessMode
  readonly accessible: boolean
  readonly readable: boolean
  readonly writable: boolean
  readonly persistent: boolean
  readonly securityScoped: boolean
  readonly providerBacked: boolean
  readonly seekable?: boolean
  readonly requiredManifestPermissions: readonly string[]
  readonly recoveryAction: ArchiveRecoveryAction
  readonly reason?: string
}
