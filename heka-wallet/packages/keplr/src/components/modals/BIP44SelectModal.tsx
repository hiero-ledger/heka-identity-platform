import { HekaTheme, useHekaTheme, useGlobalStyles } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native'

import { BIP44Option } from '../../common/BIP44Option'
import { useZeroOrPositiveIntegerString } from '../../utils/useZeroOrPositiveIntegerString'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    container: {
      marginVertical: theme.Spacing.md,
    },
    modal: {
      backgroundColor: theme.ColorPallet.brand.primaryBackground,
    },
    bodyContainer: {
      flexDirection: 'row',
      marginBottom: theme.Spacing.md,
    },
    inputSection: {
      ...theme.TextTheme.caption,
      textAlign: 'center',
    },
    pathSection: {
      ...theme.TextTheme.caption,
      paddingTop: 12,
    },
    errorText: {
      color: 'red',
      marginBottom: theme.Spacing.xs,
    },
  })

interface BIP44SelectModalProps {
  isOpen: boolean
  close: () => void
  bip44Option: BIP44Option
}

export const BIP44SelectModal: React.FC<BIP44SelectModalProps> = observer(({ bip44Option, close, isOpen }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()

  const account = useZeroOrPositiveIntegerString(bip44Option.account.toString())
  const change = useZeroOrPositiveIntegerString(bip44Option.change.toString())
  const index = useZeroOrPositiveIntegerString(bip44Option.index.toString())

  const isChangeZeroOrOne = !change.isEmpty && (change.number === 0 || change.number === 1)

  if (!isOpen) return null
  return (
    <Modal transparent style={styles.modal} visible={isOpen} onRequestClose={close} animationType={'fade'}>
      <View style={globalStyles.centeredView}>
        <View style={globalStyles.modalContent}>
          <Text style={{ ...theme.TextTheme.headingThree, marginBottom: theme.Spacing.md }}>
            {t('Crypto.Register.BIP44.HDDerivationPath')}
          </Text>
          <Text style={{ ...theme.TextTheme.caption, marginBottom: theme.Spacing.md }}>
            {t('Crypto.Register.BIP44.Description')}
          </Text>
          <View style={styles.bodyContainer}>
            <Text style={styles.pathSection}>{`m/44’/${bip44Option.coinType ?? '-'}’`}</Text>
            <TextInput
              value={account.value}
              style={styles.inputSection}
              keyboardType="number-pad"
              onChangeText={account.setValue}
            />
            <Text style={styles.pathSection}>’/</Text>
            <TextInput
              value={change.value}
              style={styles.inputSection}
              keyboardType="number-pad"
              onChangeText={change.setValue}
            />
            <Text style={styles.pathSection}>/</Text>
            <TextInput
              value={index.value}
              style={styles.inputSection}
              keyboardType="number-pad"
              onChangeText={index.setValue}
            />
          </View>
          {!isChangeZeroOrOne ? <Text style={styles.errorText}>{t('Crypto.Register.BIP44.InvalidChange')}</Text> : null}
          <Button
            title={t('Common.Confirm')}
            buttonType={ButtonType.Primary}
            disabled={account.isEmpty || change.isEmpty || index.isEmpty || !isChangeZeroOrOne}
            onPress={() => {
              bip44Option.setAccount(account.number)
              bip44Option.setChange(change.number)
              bip44Option.setIndex(index.number)

              close()
            }}
          />
        </View>
      </View>
    </Modal>
  )
})
