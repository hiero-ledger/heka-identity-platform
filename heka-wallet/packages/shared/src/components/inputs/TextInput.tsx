import React, { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { TextInput as PaperTextInput, TextInputProps as PaperInputProps, HelperText } from 'react-native-paper'

import { ColorPalette, HekaTheme, useHekaTheme } from '../../theme'

const useStyles = ({ BorderRadius, BorderWidth }: HekaTheme) =>
  StyleSheet.create({
    input: {
      backgroundColor: ColorPalette.brand.primaryBackground,
      borderTopRightRadius: BorderRadius.medium,
      borderTopLeftRadius: BorderRadius.medium,
      borderRadius: BorderRadius.medium,
      borderWidth: BorderWidth.small,
      borderColor: ColorPalette.brand.secondaryDisabled,
    },
  })

interface Props extends Omit<PaperInputProps, 'error'> {
  error?: string
  inputRight?: ReactNode | null
  inputLeft?: ReactNode | null
}

export const TextInput: React.FC<Props> = ({ error, inputRight, inputLeft, ...textInputProps }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { ColorPalette, Spacing } = theme

  return (
    <>
      <PaperTextInput
        activeUnderlineColor={ColorPalette.brand.label}
        underlineStyle={{ backgroundColor: 'transparent' }}
        style={{
          ...styles.input,
          marginBottom: !error ? Spacing.xl : 0,
          borderColor: !error ? ColorPalette.brand.secondaryDisabled : ColorPalette.semantic.error,
        }}
        error={!!error}
        right={inputRight}
        left={inputLeft}
        {...textInputProps}
      />
      {error && (
        <HelperText style={{ paddingTop: 0 }} padding={'none'} type={'error'}>
          {error}
        </HelperText>
      )}
    </>
  )
}
