import { AskarWallet } from '@credo-ts/askar'
import { AskarModuleConfig } from '@credo-ts/askar/build/AskarModuleConfig'
import { ConsoleLogger, LogLevel, SigningProviderRegistry, WalletConfig } from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import { agentDependencies } from '@credo-ts/react-native'
import { ariesAskar } from '@hyperledger/aries-askar-react-native'
import { useAuth } from '@hyperledger/aries-bifold-core'
import { storeWalletSecret } from '@hyperledger/aries-bifold-core/App/services/keychain'
import axios from 'axios'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Platform } from 'react-native'
import { DocumentDirectoryPath, downloadFile, exists, readFile, unlink, writeFile } from 'react-native-fs'
import { unzipWithPassword, zipWithPassword } from 'react-native-zip-archive'

import { walletProviderURL } from '../config'
import { useRootStore } from '../contexts'

import { generatePbkdf2Key } from './crypto'

const IOS_PASSWORD_LENGTH = 32

const BACKUP_NAME = `heka-wallet-backup`
const BACKUP_FILE_NAME = `heka-wallet-backup.zip`

interface WalletBackupMetadata {
  walletConfig: WalletConfig
  walletKeySalt: string
}

export const useWalletBackupHelpers = () => {
  const { t } = useTranslation()
  const { agent } = useAgent()

  const { getWalletCredentials } = useAuth()
  const { passkeysStore } = useRootStore()

  const [remoteBackupPath, setRemoteBackupPath] = useState<string | null>()

  // TODO: Find a better way to do this
  // Possible option would be to find a good way to show auth modal from here (modal should be rendered 'globally')
  // This function is screen agnostic, so we should try and handle auth without interacting with screen-specific components
  const authenticateOrRegisterPasskey = useCallback(
    (user: string) => {
      return new Promise((resolve, reject) => {
        Alert.alert(t('Passkeys.PasskeyAuth'), t('Passkeys.SelectAuthOption'), [
          { text: t('Common.CreateNew'), onPress: () => passkeysStore.register(user).then(resolve).catch(reject) },
          {
            text: t('Common.UseExisting'),
            onPress: () => passkeysStore.authenticate(user).then(resolve).catch(reject),
          },
        ])
      })
    },
    [t, passkeysStore]
  )

  const tryDownloadRemoteBackup = useCallback(async (user: string) => {
    try {
      const remoteBackupPath = `${DocumentDirectoryPath}/${BACKUP_NAME}-remote.zip`

      const { promise: backupDownloadPromise } = downloadFile({
        fromUrl: `${walletProviderURL}/backup/${user}`,
        toFile: remoteBackupPath,
      })

      const downloadResult = await backupDownloadPromise
      if (downloadResult.statusCode !== 200) {
        console.error(`Wallet backup download failed with status code: ${downloadResult.statusCode}`)
        return false
      }

      setRemoteBackupPath(remoteBackupPath)
      return true
    } catch (error: unknown) {
      console.error('Error on downloading wallet backup', error)
      return false
    }
  }, [])

  const backupWallet = useCallback(
    async (user: string) => {
      if (!agent) {
        throw new Error('Agent is not initialized yet')
      }

      const walletCredentials = await getWalletCredentials()
      if (!walletCredentials) {
        throw new Error('Cannot get wallet credentials')
      }

      if (!passkeysStore.isAuthenticated) {
        await authenticateOrRegisterPasskey(user)
      }

      const backupDirPath = `${DocumentDirectoryPath}/backupDir`
      const backupFilePath = `${backupDirPath}/${BACKUP_NAME}.wallet`
      const metadataFilePath = `${backupDirPath}/${BACKUP_NAME}-metadata.json`

      if (await exists(backupDirPath)) {
        await unlink(backupDirPath)
      }

      await agent.wallet.export({
        path: backupFilePath,
        key: agent.wallet.walletConfig!.key,
      })

      const backupMetadata: WalletBackupMetadata = {
        walletConfig: agent.wallet.walletConfig!,
        walletKeySalt: walletCredentials.salt,
      }
      await writeFile(metadataFilePath, JSON.stringify(backupMetadata))

      let encryptionKey = await generatePbkdf2Key(passkeysStore.HMAC)

      // On iOS, there is an issue with zipping files using long passwords
      // See https://github.com/mockingbot/react-native-zip-archive/issues/321
      if (Platform.OS === 'ios') {
        encryptionKey = encryptionKey.substring(0, IOS_PASSWORD_LENGTH)
      }

      const zipFilePath = `${DocumentDirectoryPath}/${BACKUP_FILE_NAME}`
      await zipWithPassword(backupDirPath, zipFilePath, encryptionKey)

      await unlink(backupDirPath)

      const uploadFormData = new FormData()
      uploadFormData.append('user', user)
      uploadFormData.append('file', {
        uri: `file://${zipFilePath}`,
        name: BACKUP_FILE_NAME,
        type: 'application/zip ',
      })

      await axios.post(`${walletProviderURL}/backup`, uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      await unlink(zipFilePath)
    },
    [agent, getWalletCredentials, passkeysStore, authenticateOrRegisterPasskey]
  )

  const restoreWallet = useCallback(async () => {
    const isBackupExists = !!remoteBackupPath && (await exists(remoteBackupPath))
    if (!isBackupExists) {
      throw new Error('Backup file does not exist')
    }

    let encryptionKey = await generatePbkdf2Key(passkeysStore.HMAC)

    // On iOS, there is an issue with zipping files using long passwords
    // See https://github.com/mockingbot/react-native-zip-archive/issues/321
    if (Platform.OS === 'ios') {
      encryptionKey = encryptionKey.substring(0, IOS_PASSWORD_LENGTH)
    }

    const backupDirPath = `${DocumentDirectoryPath}/backupDir`
    await unzipWithPassword(remoteBackupPath, backupDirPath, encryptionKey)

    const backupFilePath = `${backupDirPath}/${BACKUP_NAME}.wallet`
    const metadataFilePath = `${backupDirPath}/${BACKUP_NAME}-metadata.json`

    const backupMetadata = await readFile(metadataFilePath).then((jsonValue) => JSON.parse(jsonValue))

    const walletCredentials = {
      id: backupMetadata.walletConfig.id,
      key: backupMetadata.walletConfig.key,
      salt: backupMetadata.walletKeySalt,
    }

    // We use Askar Wallet instance here as we don't need higher level API of Credo Agent for import
    const askarWallet = new AskarWallet(
      new ConsoleLogger(LogLevel.off),
      new agentDependencies.FileSystem(),
      new SigningProviderRegistry([]),
      new AskarModuleConfig({ ariesAskar })
    )

    await askarWallet.import(backupMetadata.walletConfig, {
      path: backupFilePath,
      key: backupMetadata.walletConfig.key,
    })

    await unlink(backupDirPath)

    await storeWalletSecret(walletCredentials)
  }, [remoteBackupPath, passkeysStore])

  return { tryDownloadRemoteBackup, backupWallet, restoreWallet }
}
