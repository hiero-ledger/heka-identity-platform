import { Button, ButtonLocation, ButtonType, HeaderButton, testIdWithKey } from '@hyperledger/aries-bifold-core'
import ButtonLoading from '@hyperledger/aries-bifold-core/App/components/animated/ButtonLoading'
import { minPINLength as walletPinLength } from '@hyperledger/aries-bifold-core/App/constants'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput as TextInputClass, View } from 'react-native'

import { HekaTheme, useHekaTheme, useGlobalStyles } from '../../theme'
import { platformBackIconConfig } from '../../utils/platform'
import { PINInput, TextInput } from '../inputs'
import { Numpad } from '../misc'

const useStyles = ({ TextTheme, Spacing, ColorPallet }: HekaTheme) =>
  StyleSheet.create({
    title: {
      ...TextTheme.headingFour,
      paddingTop: Spacing.xxxl,
      textAlign: 'center',
    },
    container: {
      flex: 1,
      paddingTop: Spacing.xxxl,
      backgroundColor: ColorPallet.brand.primaryBackground,
    },
    inputContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    buttonContainer: {
      paddingBottom: Spacing.xl,
    },
    headerButtonContainer: {
      paddingTop: Spacing.md,
      backgroundColor: ColorPallet.brand.primaryBackground,
    },
    numpadContainer: {
      justifyContent: 'flex-end',
      // TODO: Find a better way to do this
      // Ignore default container padding using negative margin
      marginHorizontal: -Spacing.xl,
    },
    pinErrorText: {
      color: ColorPallet.semantic.error,
      marginTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
  })

export enum ConfirmationInputType {
  PIN,
  Password,
}

interface ConfirmationInputModalProps {
  title: string
  inputType: ConfirmationInputType
  onConfirm: (value: string) => Promise<void>
  onCancel: () => void
  doneButtonTitle: string
  onValueChanged?: (value: string) => void
  errorState?: boolean
  inputLabel?: string
  isVisible?: boolean
  pinLength?: number
}

export const ConfirmationInputModal: React.FC<ConfirmationInputModalProps> = ({
  title,
  inputType,
  onConfirm: onConfirmAction,
  onCancel: onCancelAction,
  doneButtonTitle,
  onValueChanged,
  errorState,
  inputLabel,
  isVisible = true,
  pinLength = walletPinLength,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const globalStyles = useGlobalStyles()

  const [value, setValue] = useState('')
  const [inProgress, setInProgress] = useState(false)

  const inputRef = useRef<TextInputClass>(null)

  const onChange = (value: string) => {
    setValue(value)
    onValueChanged && onValueChanged(value)
    if (inputType === ConfirmationInputType.PIN && value.length === pinLength) {
      onConfirm(value)
    }
  }

  const onConfirm = async (value: string) => {
    setInProgress(true)
    try {
      await onConfirmAction(value)
    } finally {
      setValue('')
      setInProgress(false)
    }
  }

  const onCancel = () => {
    setValue('')
    onCancelAction()
  }

  const onShow = () => {
    // 'Dirty' hack to make input autofocus work inside a modal on Android
    // See https://github.com/react-native-modal/react-native-modal/issues/516
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const confirmDisabled = !value || inProgress
  return (
    <Modal visible={isVisible} animationType="fade" onShow={onShow} onRequestClose={onCancel}>
      <SafeAreaView style={styles.headerButtonContainer}>
        <HeaderButton
          onPress={onCancel}
          icon={platformBackIconConfig.name}
          buttonLocation={ButtonLocation.Left}
          accessibilityLabel={'Cancel'}
          testID={testIdWithKey('Cancel')}
        />
      </SafeAreaView>
      <ScrollView
        scrollEnabled={false}
        contentContainerStyle={{ ...styles.container, ...globalStyles.defaultContainer }}
      >
        <Text style={styles.title}>{title}</Text>
        <ConfirmationInput
          type={inputType}
          value={value}
          onChange={onChange}
          onConfirm={onConfirm}
          inputLabel={inputLabel}
          ref={inputRef}
          errorState={errorState}
        />
        {inputType === ConfirmationInputType.PIN ? (
          <Numpad
            value={value}
            onValueChange={onChange}
            numLength={pinLength}
            allowDecimal={false}
            containerStyle={styles.numpadContainer}
          />
        ) : (
          <View style={styles.buttonContainer}>
            <Button
              title={doneButtonTitle}
              buttonType={ButtonType.Primary}
              onPress={() => onConfirm(value)}
              disabled={confirmDisabled}
            >
              {inProgress && <ButtonLoading />}
            </Button>
          </View>
        )}
      </ScrollView>
    </Modal>
  )
}

interface ConfirmationInputProps {
  type: ConfirmationInputType
  value: string
  onChange: (value: string) => void
  onConfirm: (value: string) => Promise<void>
  inputLabel?: string
  ref?: React.RefObject<TextInputClass>
  errorState?: boolean
}

const ConfirmationInput: React.FC<ConfirmationInputProps> = ({
  type,
  value,
  onChange,
  onConfirm,
  inputLabel,
  ref,
  errorState,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { t } = useTranslation()

  return (
    <View style={styles.inputContainer}>
      {type === ConfirmationInputType.PIN ? (
        <>
          <PINInput
            label={inputLabel ?? t('PINEnter.EnterPIN')}
            value={value}
            onPINChanged={onChange}
            ref={ref}
            disableKeyboard
          />
          <Text style={styles.pinErrorText}>{errorState && t('PINEnter.IncorrectPIN')}</Text>
        </>
      ) : (
        <TextInput
          label={inputLabel ?? t('Crypto.Register.Form.Password.Label')}
          error={errorState ? t('Crypto.Register.Form.Password.Invalid') : undefined}
          onChangeText={onChange}
          value={value}
          returnKeyType="done"
          secureTextEntry={true}
          onSubmitEditing={() => onConfirm(value)}
          ref={ref}
        />
      )}
    </View>
  )
}
