import { act, renderHook } from '@testing-library/react-native'
import { downloadFile } from 'react-native-fs'

import { mockFunction } from '../../../jest-helpers/helpers'
import { useWalletBackupHelpers } from '../../src/utils/useWalletBackupHelpers'

jest.mock('@bifold/core', () => ({
  __esModule: true,
  useAuth: () => ({ getWalletSecret: jest.fn() }),
}))

jest.mock('@bifold/core/src/services/keychain', () => ({ storeWalletSecret: jest.fn() }))

jest.mock('@credo-ts/askar', () => ({ AskarModuleConfig: jest.fn(), AskarStoreManager: jest.fn() }))
jest.mock('@credo-ts/react-native', () => ({ agentDependencies: {} }))
jest.mock('@openwallet-foundation/askar-react-native', () => ({ askar: {} }))

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/documents',
  downloadFile: jest.fn(),
  exists: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
  writeFile: jest.fn(),
}))

jest.mock('react-native-zip-archive', () => ({ unzipWithPassword: jest.fn(), zipWithPassword: jest.fn() }))

jest.mock('../../src/contexts', () => ({ useRootStore: () => ({ passkeysStore: {} }) }))

// utils/agent.ts eagerly imports native/ESM Credo modules; only the hook is needed here.
jest.mock('../../src/utils/agent', () => ({ useHekaAgent: () => ({ agent: undefined }) }))

jest.mock('../../src/utils/crypto', () => ({ generatePbkdf2Key: jest.fn() }))

const mockDownload = (result: Promise<{ statusCode: number }>) =>
  mockFunction(downloadFile).mockReturnValue({ jobId: 1, promise: result } as never)

describe('useWalletBackupHelpers.tryDownloadRemoteBackup', () => {
  it('resolves to true when the backup is downloaded', async () => {
    mockDownload(Promise.resolve({ statusCode: 200 }))
    const { result } = renderHook(() => useWalletBackupHelpers())

    // Success stores the backup path in state, so the call runs inside act.
    await act(() => expect(result.current.tryDownloadRemoteBackup('user')).resolves.toBe(true))
  })

  it('resolves to false when the user has no backup', async () => {
    mockDownload(Promise.resolve({ statusCode: 404 }))
    const { result } = renderHook(() => useWalletBackupHelpers())

    await expect(result.current.tryDownloadRemoteBackup('user')).resolves.toBe(false)
  })

  it('rejects on any other status code', async () => {
    mockDownload(Promise.resolve({ statusCode: 500 }))
    const { result } = renderHook(() => useWalletBackupHelpers())

    await expect(result.current.tryDownloadRemoteBackup('user')).rejects.toThrow(
      'Wallet backup download failed with status code: 500'
    )
  })

  it('rejects when the download fails', async () => {
    const error = new Error('Network request failed')
    mockDownload(Promise.reject(error))
    const { result } = renderHook(() => useWalletBackupHelpers())

    await expect(result.current.tryDownloadRemoteBackup('user')).rejects.toBe(error)
  })
})
