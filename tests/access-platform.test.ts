jest.mock('react-native-nitro-modules', () => ({ NitroModules: { createHybridObject: jest.fn() } }))
import { NitroModules } from 'react-native-nitro-modules'
import { checkArchiveAccess } from '../src/access'

it('reports Android after a successful access check', async () => {
  const checkFileAccess = jest.fn().mockResolvedValue({ ok: true, accessible: true, readable: true, writable: false, persistent: true, securityScoped: false, providerBacked: false })
  ;(NitroModules.createHybridObject as jest.Mock).mockReturnValue({ checkFileAccess, getCapabilities: () => ({ platform: 'android' }) })
  const report = await checkArchiveAccess({ kind: 'file', path: '/archive.zip' }, 'read')
  expect(report.platform).toBe('android')
  expect(report.accessible).toBe(true)
  expect(checkFileAccess).toHaveBeenCalledWith('/archive.zip', 'read')
})
