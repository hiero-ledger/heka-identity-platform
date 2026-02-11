import { useAgent } from '@credo-ts/react-hooks'
import {
  BifoldError,
  ButtonLocation,
  EventTypes,
  HeaderButton,
  ToastType,
  useTheme,
} from '@hyperledger/aries-bifold-core'
import { ContactStackParams, RootStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { ModalUsage } from '@hyperledger/aries-bifold-core/App/types/remove'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter, View } from 'react-native'
import Toast from 'react-native-toast-message'

import DeleteIcon from '../../assets/bin.svg'
import { Credential, useCredentialRecordHelpers } from '../../credentials'
import ActionWarningModal from '../modals/ActionWarningModal'
import { ContextMenuModal } from '../modals/ContextMenuModal'
import { LoaderModal } from '../views/LoadingView'

interface CredentialContextMenuProps {
  credential: Credential
}

const CredentialContextMenu: React.FC<CredentialContextMenuProps> = ({ credential }) => {
  const { agent } = useAgent()

  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<ContactStackParams & RootStackParams>>()

  const theme = useTheme()

  const [showContextMenu, setShowContextMenu] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRemoveModalDisplayed, setIsRemoveModalDisplayed] = useState<boolean>(false)

  const { removeCredentialRecord } = useCredentialRecordHelpers()

  const openContextMenu = useCallback(() => setShowContextMenu(true), [])
  const closeContextMenu = useCallback(() => setShowContextMenu(false), [])

  const showRemoveModal = useCallback(() => {
    setIsRemoveModalDisplayed(true)
    setShowContextMenu(false)
  }, [])

  const hideRemoveModal = useCallback(() => {
    setIsRemoveModalDisplayed(false)
    setShowContextMenu(false)
  }, [])

  const onRemove = useCallback(async () => {
    if (!credential || !agent) return

    try {
      setIsLoading(true)
      setIsRemoveModalDisplayed(false)
      setShowContextMenu(false)

      await removeCredentialRecord(credential.record)

      navigation.pop()

      Toast.show({
        type: ToastType.Success,
        text1: t('CredentialDetails.CredentialRemoved'),
      })
    } catch (err: unknown) {
      const error = new BifoldError(t('Error.Title1032'), t('Error.Message1032'), (err as Error)?.message ?? err, 1032)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    } finally {
      setIsLoading(false)
    }
  }, [t, navigation, agent, credential, removeCredentialRecord])

  if (isLoading) {
    return <LoaderModal />
  }

  return (
    <View>
      <HeaderButton
        buttonLocation={ButtonLocation.Right}
        testID={'CredentialMenu'}
        accessibilityLabel={'CredentialMenu'}
        onPress={openContextMenu}
        icon="dots-vertical"
      />
      <ContextMenuModal
        visible={showContextMenu}
        onDismiss={closeContextMenu}
        actions={[
          {
            title: t('CredentialDetails.Remove'),
            icon: () => <DeleteIcon height={24} width={24} />,
            callback: showRemoveModal,
            color: theme.ColorPallet.semantic.error,
          },
        ]}
      />
      <ActionWarningModal
        usage={ModalUsage.CredentialRemove}
        visible={isRemoveModalDisplayed}
        onSubmit={onRemove}
        onCancel={hideRemoveModal}
      />
    </View>
  )
}

export default CredentialContextMenu
