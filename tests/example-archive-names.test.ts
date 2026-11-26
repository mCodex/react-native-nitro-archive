import { archiveName } from '../example/src/archiveNames'

describe('example archive file names', () => {
  it.each(['zip', 'tar', 'tar.gz'] as const)('reopens the name created for %s', format => {
    const filename = archiveName(' Site backup.v2 ', format)
    expect(filename).toBe(`Site backup.v2.${format}`)
    expect(archiveName(filename)).toBe(filename)
  })

  it('replaces an existing extension with the selected format', () => {
    expect(archiveName('photos.TAR.GZ', 'zip')).toBe('photos.zip')
    expect(archiveName('photos.zip', 'zip')).toBe('photos.zip')
    expect(archiveName('photos.tgz')).toBe('photos.tgz')
  })

  it.each(['', '.', '..', '.zip', '../test.zip', '/test.zip', 'dir\\test.zip', 'file:///test.zip', 'a\0b.zip'])(
    'rejects invalid file name %j for creation and opening', name => {
      expect(() => archiveName(name, 'zip')).toThrow()
      expect(() => archiveName(name)).toThrow()
    },
  )

  it('requires an extension when opening an archive', () => {
    expect(() => archiveName('sample')).toThrow(/extension/)
  })
})
