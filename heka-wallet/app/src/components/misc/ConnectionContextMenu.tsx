import { ConnectionRecord, CredentialState } from '@credo-ts/core'
import { useAgent, useCredentialByState } from '@credo-ts/react-hooks'
import {
  BifoldError,
  ButtonLocation,
  EventTypes,
  HeaderButton,
  Screens,
  Stacks,
  TabStacks,
  ToastType,
  useTheme,
} from '@hyperledger/aries-bifold-core'
import { ContactStackParams, RootStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter, View } from 'react-native'
import Toast from 'react-native-toast-message'

import DeleteIcon from '../../assets/bin.svg'
import EditIcon from '../../assets/edit.svg'
import ActionWarningModal, { ModalUsage } from '../modals/ActionWarningModal'
import { ContextMenuModal } from '../modals/ContextMenuModal'
import { LoaderModal } from '../views/LoadingView'

interface ConnectionContextMenuProps {
  connection: ConnectionRecord
}

const ConnectionContextMenu: React.FC<ConnectionContextMenuProps> = ({ connection }) => {
  const { agent } = useAgent()

  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<ContactStackParams & RootStackParams>>()

  const theme = useTheme()

  const [showContextMenu, setShowContextMenu] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRemoveModalDisplayed, setIsRemoveModalDisplayed] = useState<boolean>(false)
  const [isCredentialsRemoveModalDisplayed, setIsCredentialsRemoveModalDisplayed] = useState<boolean>(false)

  // FIXME: This should be exposed via a react hook that allows to filter credentials by connection id
  const connectionCredentials = [
    ...useCredentialByState(CredentialState.CredentialReceived),
    ...useCredentialByState(CredentialState.Done),
  ].filter((credential) => credential.connectionId === connection?.id)

  const openContextMenu = useCallback(() => setShowContextMenu(true), [])
  const closeContextMenu = useCallback(() => setShowContextMenu(false), [])

  const onRename = useCallback(() => {
    closeContextMenu()
    navigation.navigate(Screens.RenameContact, { connectionId: connection.id })
  }, [closeContextMenu, navigation, connection?.id])

  const onRemove = useCallback(() => {
    if (connectionCredentials?.length) {
      setIsCredentialsRemoveModalDisplayed(true)
    } else {
      setIsRemoveModalDisplayed(true)
    }
    closeContextMenu()
  }, [closeContextMenu, connectionCredentials?.length])

  const onSubmitRemove = useCallback(async () => {
    if (!(agent && connection)) {
      return
    }

    try {
      setIsLoading(true)
      setIsRemoveModalDisplayed(false)
      setShowContextMenu(false)

      await agent.connections.deleteById(connection.id)

      navigation.navigate(Stacks.TabStack, { screen: TabStacks.HomeStack, params: { screen: Screens.Home } })

      Toast.show({
        type: ToastType.Success,
        text1: t('ContactDetails.ContactRemoved'),
      })
    } catch (err: unknown) {
      const error = new BifoldError(t('Error.Title1037'), t('Error.Message1037'), (err as Error)?.message ?? err, 1037)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    } finally {
      setIsLoading(false)
    }
  }, [agent, connection, navigation, t])

  const onCancelRemove = useCallback(() => {
    setIsRemoveModalDisplayed(false)
    setShowContextMenu(false)
  }, [])

  const onGoToCredentials = useCallback(() => {
    setIsCredentialsRemoveModalDisplayed(false)
    setShowContextMenu(false)
    navigation.getParent()?.navigate(TabStacks.CredentialStack, { screen: Screens.Credentials })
  }, [navigation])

  const onCancelUnableToRemove = useCallback(() => {
    setIsCredentialsRemoveModalDisplayed(false)
    setShowContextMenu(false)
  }, [])

  if (isLoading) {
    return <LoaderModal />
  }

  return (
    <View>
      <HeaderButton
        buttonLocation={ButtonLocation.Right}
        testID={'ConnectionMenu'}
        accessibilityLabel={'ConnectionMenu'}
        onPress={openContextMenu}
        icon="dots-vertical"
      />
      <ContextMenuModal
        visible={showContextMenu}
        onDismiss={closeContextMenu}
        actions={[
          {
            title: t('ConnectionDetails.Rename'),
            icon: () => <EditIcon height={24} width={24} />,
            callback: onRename,
          },
          {
            title: t('ConnectionDetails.Delete'),
            icon: () => <DeleteIcon height={24} width={24} />,
            callback: onRemove,
            color: theme.ColorPallet.semantic.error,
          },
        ]}
      />
      <ActionWarningModal
        usage={ModalUsage.ContactRemove}
        visible={isRemoveModalDisplayed}
        onSubmit={onSubmitRemove}
        onCancel={onCancelRemove}
      />
      <ActionWarningModal
        usage={ModalUsage.ContactRemoveWithCredentials}
        visible={isCredentialsRemoveModalDisplayed}
        onSubmit={onGoToCredentials}
        onCancel={onCancelUnableToRemove}
      />
    </View>
  )
}

export default ConnectionContextMenu
