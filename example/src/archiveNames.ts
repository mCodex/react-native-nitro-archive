import type { ArchiveFormat } from 'react-native-nitro-archive'

const archiveExtension = /\.(?:tar\.gz|tgz|zip|tar)$/i

export function archiveName(input: string, format?: ArchiveFormat): string {
  const name = input.trim()
  const stem = name.replace(archiveExtension, '')
  if (!stem || stem === '.' || stem === '..' || /[/\\\u0000-\u001f]/u.test(name)) {
    throw new Error('Enter a file name without a folder or path.')
  }
  if (format) return `${stem}.${format}`
  if (!archiveExtension.test(name)) throw new Error('Include the .zip, .tar, or .tar.gz extension.')
  return name
}
