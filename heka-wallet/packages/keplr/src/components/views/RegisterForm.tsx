import { HekaTheme, useHekaTheme, useGlobalStyles, TextInput } from '@heka-wallet/shared'
import { Button, ButtonType, ToastType } from '@hyperledger/aries-bifold-core'
import ButtonLoading from '@hyperledger/aries-bifold-core/App/components/animated/ButtonLoading'
import { Mnemonic } from '@keplr-wallet/crypto'
import { RegisterConfig } from '@keplr-wallet/hooks'
import { Buffer } from 'buffer'
import React, { useState } from 'react'
import { Control, Controller, useForm, UseFormGetValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ReturnKeyTypeOptions, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'

import { BIP44Option } from '../../common'
import { isPrivateKey, trimWords } from '../../utils/mnemonic'

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    submitButton: {
      flex: 1,
      justifyContent: 'flex-end',
      paddingBottom: theme.Spacing.md,
      marginTop: theme.Spacing.md,
    },
  })

export interface RegisterData {
  name: string
  password: string
  mnemonic: string
}

interface RegisterFormData extends RegisterData {
  confirmPassword: string
}

interface RegisterFormProps {
  registerConfig: RegisterConfig
  onSubmit: (data: RegisterData) => Promise<void>
  bip44Option: BIP44Option
  showMnemonicField?: boolean
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ registerConfig, onSubmit, showMnemonicField }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { t } = useTranslation()

  const [mode] = useState(registerConfig.mode)

  const {
    control,
    handleSubmit,
    setFocus,
    getValues,
    formState: { errors },
  } = useForm<RegisterFormData>()

  const [isCreating, setIsCreating] = useState(false)

  const submit = handleSubmit(async () => {
    setIsCreating(true)
    try {
      const formData = getValues()
      await onSubmit(formData)
    } catch (e) {
      console.error(e)
      Toast.show({
        type: ToastType.Error,
        text1: t('Error.Problem'),
        text2: (e as Error)?.message || t('Error.Unknown'),
        position: 'bottom',
      })
    } finally {
      setIsCreating(false)
    }
  })

  return (
    <View style={{ flex: 1 }}>
      {showMnemonicField ? (
        <MnemonicField control={control} onSubmitEditing={() => setFocus('name')} error={errors.mnemonic?.message} />
      ) : null}
      <View style={{ marginTop: theme.Spacing.xxl }}>
        <WalletNicknameField
          control={control}
          returnKeyType={mode === 'add' ? 'done' : 'next'}
          onSubmitEditing={() => {
            if (mode === 'add') {
              submit()
            }
            if (mode === 'create') {
              setFocus('password')
            }
          }}
          error={errors.name?.message}
        />
        {/*<BIP44AdvancedButton bip44Option={bip44Option} />*/}
        {mode === 'create' && (
          <PasswordFields
            control={control}
            getValues={getValues}
            passwordProps={{ onSubmitEditing: () => setFocus('confirmPassword'), error: errors.password?.message }}
            confirmPasswordProps={{ onSubmitEditing: submit, error: errors.confirmPassword?.message }}
          />
        )}
      </View>
      <View style={styles.submitButton}>
        <Button title={t('Global.Continue')} buttonType={ButtonType.Primary} onPress={submit} disabled={isCreating}>
          {isCreating && <ButtonLoading />}
        </Button>
      </View>
    </View>
  )
}

interface RegisterFormFieldProps {
  control: Control<RegisterFormData>
  returnKeyType?: ReturnKeyTypeOptions
  onSubmitEditing?: () => void
  error?: string
}

const MnemonicField: React.FC<RegisterFormFieldProps> = ({ control, onSubmitEditing, returnKeyType, error }) => {
  const theme = useHekaTheme()
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()

  const validateMnemonic = (value: string) => {
    value = trimWords(value)
    if (!isPrivateKey(value)) {
      if (value.split(' ').length < 8) {
        return t('Crypto.Register.Form.Mnemonic.TooShort')
      }

      if (!Mnemonic.validateMnemonic(value)) {
        return t('Crypto.Register.Form.Mnemonic.Invalid')
      }
    } else {
      value = value.replace('0x', '')
      if (value.length !== 64) {
        return t('Crypto.Register.Form.Mnemonic.InvalidPrivateKeyLength')
      }

      try {
        Buffer.from(value, 'hex')
      } catch {
        return t('Crypto.Register.Form.Mnemonic.InvalidPrivateKey')
      }
    }
  }

  return (
    <Controller
      control={control}
      rules={{
        required: t('Crypto.Register.Form.Mnemonic.Required'),
        validate: validateMnemonic,
      }}
      render={({ field: { onChange, value, ref } }) => {
        return (
          <TextInput
            label={''}
            returnKeyType={returnKeyType ?? 'next'}
            style={{ ...theme.Inputs.textInput, ...globalStyles.multilineTextCard, minHeight: 120 }}
            multiline={true}
            textAlignVertical={'top'}
            numberOfLines={4}
            onSubmitEditing={onSubmitEditing}
            error={error}
            onChangeText={onChange}
            value={value}
            ref={ref}
          />
        )
      }}
      name="mnemonic"
      defaultValue=""
    />
  )
}

const WalletNicknameField: React.FC<RegisterFormFieldProps> = ({ control, onSubmitEditing, returnKeyType, error }) => {
  const { t } = useTranslation()

  return (
    <Controller
      control={control}
      rules={{
        required: t('Crypto.Register.Form.WalletLabel.Required'),
      }}
      render={({ field: { onChange, value, ref } }) => {
        return (
          <TextInput
            label={t('Crypto.Register.Form.WalletLabel.Label')}
            returnKeyType={returnKeyType ?? 'next'}
            onSubmitEditing={onSubmitEditing}
            error={error}
            onChangeText={onChange}
            value={value}
            ref={ref}
          />
        )
      }}
      name="name"
      defaultValue=""
    />
  )
}

interface PasswordFieldsProps {
  control: Control<RegisterFormData>
  getValues: UseFormGetValues<RegisterFormData>
  passwordProps: Omit<RegisterFormFieldProps, 'control'>
  confirmPasswordProps: Omit<RegisterFormFieldProps, 'control'>
}

const PasswordFields: React.FC<PasswordFieldsProps> = ({ control, getValues, passwordProps, confirmPasswordProps }) => {
  const { t } = useTranslation()

  return (
    <>
      <Controller
        control={control}
        rules={{
          required: t('Crypto.Register.Form.Password.Required'),
          validate: (value: string): string | undefined => {
            if (value.length < 8) {
              return t('Crypto.Register.Form.Password.TooShort')
            }
          },
        }}
        render={({ field: { onChange, value, ref } }) => {
          return (
            <TextInput
              label={t('Crypto.Register.Form.Password.Label')}
              returnKeyType={passwordProps.returnKeyType ?? 'next'}
              secureTextEntry={true}
              onSubmitEditing={passwordProps.onSubmitEditing}
              error={passwordProps.error}
              onChangeText={onChange}
              value={value}
              ref={ref}
            />
          )
        }}
        name="password"
        defaultValue=""
      />
      <Controller
        control={control}
        rules={{
          required: t('Crypto.Register.Form.ConfirmPassword.Required'),
          validate: (value: string): string | undefined => {
            if (getValues('password') !== value) {
              return t('Crypto.Register.Form.ConfirmPassword.DoesntMatch')
            }
          },
        }}
        render={({ field: { onChange, onBlur, value, ref } }) => {
          return (
            <TextInput
              label={t('Crypto.Register.Form.ConfirmPassword.Label')}
              returnKeyType={confirmPasswordProps.returnKeyType ?? 'done'}
              secureTextEntry={true}
              onSubmitEditing={confirmPasswordProps.onSubmitEditing}
              error={confirmPasswordProps.error}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              ref={ref}
            />
          )
        }}
        name="confirmPassword"
        defaultValue=""
      />
    </>
  )
}
