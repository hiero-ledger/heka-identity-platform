import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { GenericFn } from '@hyperledger/aries-bifold-core'
import * as React from 'react'
import { StyleSheet, Text, TouchableOpacity } from 'react-native'
import { Dialog, Portal } from 'react-native-paper'

interface ContextMenuModalProps {
  visible: boolean
  actions: Array<{
    title: string
    icon: React.FC
    callback: GenericFn
    color?: string
  }>
  onDismiss: GenericFn
}

const useStyles = ({ ColorPallet, TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    dialog: {
      position: 'absolute',
      top: 0,
      right: 0,
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
      borderRadius: Spacing.md,
      padding: Spacing.xs,
    },
    optionContainer: {
      flexDirection: 'row',
      marginTop: 0,
      justifyContent: 'flex-start',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    option: TextTheme.modalNormal,
  })

export const ContextMenuModal: React.FC<ContextMenuModalProps> = ({ visible, actions, onDismiss }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <Portal>
      <Dialog visible={visible} style={styles.dialog} onDismiss={onDismiss}>
        {actions.map((action, index) => (
          <TouchableOpacity key={index} onPress={action.callback} style={styles.optionContainer}>
            <action.icon />
            <Text style={[styles.option, action.color ? { color: action.color } : {}]}>{action.title}</Text>
          </TouchableOpacity>
        ))}
      </Dialog>
    </Portal>
  )
}
