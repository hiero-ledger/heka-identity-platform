import { ButtonLocation, ContactStackParams, IconButton, Screens, Stacks, TabStacks, ToastType } from '@bifold/core'
import { RootStackParams } from '@bifold/core/src/types/navigators'
import { DidCommConnectionRecord } from '@credo-ts/didcomm'
import { useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Toast from 'react-native-toast-message'

import DeleteIcon from '../../assets/bin.svg'
import EditIcon from '../../assets/edit.svg'
import { useConnectionRemoval } from '../../hooks/useConnectionRemoval'
import ActionWarningModal, { ModalUsage } from '../modals/ActionWarningModal'
import { ContextMenuModal } from '../modals/ContextMenuModal'
import { LoaderModal } from '../views/LoadingView'

interface ConnectionContextMenuProps {
  connection: DidCommConnectionRecord
}

const ConnectionContextMenu: React.FC<ConnectionContextMenuProps> = ({ connection }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<ContactStackParams & RootStackParams>>()

  const theme = useHekaTheme()

  const [showContextMenu, setShowContextMenu] = useState(false)
  const [isRemoveModalDisplayed, setIsRemoveModalDisplayed] = useState<boolean>(false)
  const [isCredentialsRemoveModalDisplayed, setIsCredentialsRemoveModalDisplayed] = useState<boolean>(false)

  const onRemoved = useCallback(() => {
    navigation.navigate(Stacks.TabStack, { screen: TabStacks.HomeStack, params: { screen: Screens.Home } })

    Toast.show({
      type: ToastType.Success,
      text1: t('ContactDetails.ContactRemoved'),
    })
  }, [navigation, t])

  const { hasCredentials, isRemoving, removeConnection } = useConnectionRemoval(connection, onRemoved)

  const openContextMenu = useCallback(() => setShowContextMenu(true), [])
  const closeContextMenu = useCallback(() => setShowContextMenu(false), [])

  const onRename = useCallback(() => {
    closeContextMenu()
    navigation.navigate(Screens.RenameContact, { connectionId: connection.id })
  }, [closeContextMenu, navigation, connection?.id])

  const onRemove = useCallback(() => {
    if (hasCredentials) {
      setIsCredentialsRemoveModalDisplayed(true)
    } else {
      setIsRemoveModalDisplayed(true)
    }
    closeContextMenu()
  }, [closeContextMenu, hasCredentials])

  const onSubmitRemove = useCallback(async () => {
    setIsRemoveModalDisplayed(false)
    setShowContextMenu(false)
    await removeConnection()
  }, [removeConnection])

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

  if (isRemoving) {
    return <LoaderModal />
  }

  return (
    <View>
      <IconButton
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
            color: theme.ColorPalette.semantic.error,
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
