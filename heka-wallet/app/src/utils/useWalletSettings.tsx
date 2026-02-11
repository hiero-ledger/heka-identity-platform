import { exportLogs, useHekaTheme } from '@heka-wallet/shared'
import {
  Locales,
  Screens as BifoldScreens,
  Stacks as BifoldStacks,
  ToastType,
  TOKENS,
  useServices,
  useStore as useBifoldStore,
} from '@hyperledger/aries-bifold-core'
import {
  RootStackParams as BifoldStackParams,
  SettingStackParams,
} from '@hyperledger/aries-bifold-core/App/types/navigators'
import { useNavigation } from '@react-navigation/core'
import { StackNavigationProp } from '@react-navigation/stack'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { isExternalAuthEnabled, isWalletBackupEnabled } from '../config'
import { useRootStore } from '../contexts'
import { RootStackParams, Screens, Stacks } from '../navigators/types'
import { SettingSection } from '../types/settings'

import { useWalletBackupHelpers } from './useWalletBackupHelpers'

export const useWalletSettings = (): SettingSection[] => {
  const { i18n, t } = useTranslation()

  const { ColorPallet } = useHekaTheme()

  const navigation = useNavigation<StackNavigationProp<BifoldStackParams & RootStackParams & SettingStackParams>>()

  const [bifoldStore] = useBifoldStore()
  const { oauthStore, passkeysStore } = useRootStore()

  const { backupWallet } = useWalletBackupHelpers()

  const [{ enablePushNotifications }] = useServices([TOKENS.CONFIG])
  const currentLanguage = i18n.t('Language.code', { context: i18n.language as Locales })

  const onWalletBackup = useCallback(async () => {
    const user = await passkeysStore.getUser()
    try {
      await backupWallet(user)
      Toast.show({
        type: ToastType.Success,
        text1: 'Wallet has been successfully backed up',
        position: 'bottom',
      })
    } catch (error: unknown) {
      console.error(error)
      Toast.show({
        type: ToastType.Error,
        text1: t('Error.Problem'),
        text2: (error as Error)?.message || t('Error.Unknown'),
      })
    }
  }, [passkeysStore, backupWallet, t])

  return useMemo(() => {
    let settingSections: SettingSection[] = [
      {
        header: {
          icon: { name: bifoldStore.preferences.useConnectionInviterCapability ? 'person' : 'apartment', size: 30 },
          title: bifoldStore.preferences.useConnectionInviterCapability ? bifoldStore.preferences.walletName : '',
          iconRight: {
            name: 'edit',
            action: () => {
              navigation.navigate(BifoldScreens.NameWallet)
            },
            accessibilityLabel: t('NameWallet.EditWalletName'),
            style: { color: ColorPallet.brand.primary },
          },
        },
        data: [
          {
            title: t('Screens.Contacts'),
            accessibilityLabel: t('Screens.Contacts'),
            onPress: () =>
              navigation.getParent()?.navigate(BifoldStacks.ContactStack, {
                screen: BifoldScreens.Contacts,
                params: { navigation: navigation },
              }),
          },
          {
            title: t('Settings.WhatAreContacts'),
            accessibilityLabel: t('Settings.WhatAreContacts'),
            onPress: () => navigation.navigate(BifoldStacks.ContactStack, { screen: BifoldScreens.WhatAreContacts }),
            value: undefined,
          },
        ],
      },
      {
        header: {
          icon: { name: 'settings' },
          title: t('Settings.AppSettings'),
        },
        data: [
          {
            title: t('Global.Biometrics'),
            value: bifoldStore.preferences.useBiometry ? t('Global.On') : t('Global.Off'),
            accessibilityLabel: t('Global.Biometrics'),
            onPress: () => navigation.navigate(BifoldScreens.UseBiometry),
          },
          {
            title: t('Settings.Language'),
            value: currentLanguage,
            accessibilityLabel: t('Settings.Language'),
            onPress: () => navigation.navigate(BifoldScreens.Language),
          },
          {
            title: t('Settings.ChangePin'),
            value: undefined,
            accessibilityLabel: t('Settings.ChangePin'),
            onPress: () =>
              navigation
                .getParent()
                ?.navigate(BifoldStacks.SettingStack, { screen: BifoldScreens.CreatePIN, params: { updatePin: true } }),
          },
        ],
      },
      {
        header: { title: t('Settings.Information'), icon: { name: 'info' } },
        data: [
          {
            title: t('Settings.Terms'),
            accessibilityLabel: t('Settings.Terms'),
            onPress: () => navigation.navigate(BifoldStacks.SettingStack, { screen: BifoldScreens.Terms }),
          },
          {
            title: t('Settings.Introduction'),
            accessibilityLabel: t('Settings.Introduction'),
            onPress: () => navigation.navigate(BifoldStacks.SettingStack, { screen: BifoldScreens.Onboarding }),
          },
          {
            title: t('Settings.Logs'),
            accessibilityLabel: t('Settings.Logs'),
            onPress: exportLogs,
          },
        ],
      },
    ]

    if (isExternalAuthEnabled) {
      const externalAuthSection: SettingSection = {
        header: { title: t('Settings.Account'), icon: { name: 'account-circle' } },
        data: [
          {
            title: t('Settings.UserProfile'),
            accessibilityLabel: t('Settings.UserProfile'),
            onPress: () => navigation.navigate(Stacks.SettingsStack, { screen: Screens.UserProfile }),
          },
          {
            title: t('Settings.DeleteMyAccount'),
            accessibilityLabel: t('Settings.DeleteMyAccount'),
            onPress: () => oauthStore.openAccountDeletionPage(),
          },
        ],
      }
      settingSections = [externalAuthSection, ...settingSections]
    }

    if (isWalletBackupEnabled) {
      settingSections
        .find((item) => item.header.title === t('Settings.AppSettings'))
        ?.data.push({
          title: t('WalletBackup.BackupWallet'),
          accessibilityLabel: t('WalletBackup.BackupWallet'),
          onPress: onWalletBackup,
          loadingProps: {
            title: t('WalletBackup.BackupingWallet'),
          },
        })
    }

    if (enablePushNotifications) {
      settingSections
        .find((item) => item.header.title === t('Settings.AppSettings'))
        ?.data.push({
          title: t('Settings.Notifications'),
          value: undefined,
          accessibilityLabel: t('Settings.Notifications'),
          onPress: () =>
            navigation.getParent()?.navigate(BifoldStacks.SettingStack, {
              screen: BifoldScreens.UsePushNotifications,
              params: { isMenu: true },
            }),
        })
    }

    if (bifoldStore.preferences.useHistoryCapability) {
      settingSections
        .find((item) => item.header.title === t('Settings.AppSettings'))
        ?.data.push({
          title: t('Global.History'),
          value: undefined,
          accessibilityLabel: t('Global.History'),
          onPress: () => navigation.navigate(BifoldScreens.HistorySettings),
        })
    }

    if (bifoldStore.preferences.developerModeEnabled) {
      const section = settingSections.find((item) => item.header.title === t('Settings.AppSettings'))
      if (section) {
        section.data = [
          ...section.data,
          {
            title: t('Settings.Developer'),
            accessibilityLabel: t('Settings.Developer'),
            onPress: () => navigation.navigate(BifoldScreens.Developer),
          },
        ]
      }
    }

    if (bifoldStore.preferences.useVerifierCapability) {
      settingSections.splice(1, 0, {
        header: {
          icon: { name: 'send' },
          title: t('Screens.ProofRequests'),
        },
        data: [
          {
            title: t('Screens.SendProofRequest'),
            accessibilityLabel: t('Screens.ProofRequests'),
            onPress: () =>
              navigation.getParent()?.navigate(BifoldStacks.ProofRequestsStack, {
                screen: BifoldScreens.ProofRequests,
                params: { navigation: navigation },
              }),
          },
        ],
      })

      const section = settingSections.find((item) => item.header.title === t('Settings.AppSettings'))
      if (section) {
        section.data.splice(3, 0, {
          title: t('Settings.DataRetention'),
          value: bifoldStore.preferences.useDataRetention ? t('Global.On') : t('Global.Off'),
          accessibilityLabel: t('Settings.DataRetention'),
          onPress: () => navigation.navigate(BifoldScreens.DataRetention),
        })
      }
    }

    if (bifoldStore.preferences.useConnectionInviterCapability) {
      const section = settingSections.find((item) => item.header.title === bifoldStore.preferences.walletName)
      if (section) {
        section.data.splice(1, 0, {
          title: t('Settings.ScanMyQR'),
          accessibilityLabel: t('Settings.ScanMyQR'),
          onPress: () =>
            navigation.getParent()?.navigate(BifoldStacks.ConnectStack, {
              screen: BifoldScreens.Scan,
              params: { defaultToConnect: true },
            }),
        })
      }
    }

    return settingSections
  }, [
    bifoldStore.preferences.useConnectionInviterCapability,
    bifoldStore.preferences.walletName,
    bifoldStore.preferences.useBiometry,
    bifoldStore.preferences.useHistoryCapability,
    bifoldStore.preferences.developerModeEnabled,
    bifoldStore.preferences.useVerifierCapability,
    bifoldStore.preferences.useDataRetention,
    t,
    ColorPallet.brand.primary,
    currentLanguage,
    enablePushNotifications,
    navigation,
    oauthStore,
    onWalletBackup,
  ])
}
