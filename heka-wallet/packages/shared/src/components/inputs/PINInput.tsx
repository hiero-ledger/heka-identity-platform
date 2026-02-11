import { testIdWithKey } from '@hyperledger/aries-bifold-core'
import { minPINLength } from '@hyperledger/aries-bifold-core/App/constants'
import React, { forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native'
import { CodeField } from 'react-native-confirmation-code-field'

import { HekaTheme, useHekaTheme } from '../../theme'
import { IconButton } from '../buttons'

const PIN_CELL_SIZE = 30

const HIT_SLOP = { top: 22, bottom: 22, left: 22, right: 22 }

const useStyles = ({ TextTheme, ColorPallet, Spacing, BorderWidth }: HekaTheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.md,
    },
    cell: {
      width: PIN_CELL_SIZE,
      height: PIN_CELL_SIZE,
      marginRight: Spacing.md,
      backgroundColor: ColorPallet.brand.primaryBackground,
      borderWidth: BorderWidth.medium,
      borderColor: ColorPallet.grayscale.inactiveGray,
      borderRadius: PIN_CELL_SIZE / 2,
    },
    showPINCell: {
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: BorderWidth.medium,
    },
    cellText: {
      ...TextTheme.headingThree,
      textAlignVertical: 'center',
      textAlign: 'center',
      fontFamily: 'DMMono',
      lineHeight: PIN_CELL_SIZE,
    },
  })

interface Props {
  label?: string
  value: string
  onPINChanged: (PIN: string) => void
  testID?: string
  accessibilityLabel?: string
  autoFocus?: boolean
  disableKeyboard?: boolean
}

export const PINInput: React.FC<Props & React.RefAttributes<TextInput>> = forwardRef(
  (
    { label, value, onPINChanged, testID, accessibilityLabel, disableKeyboard, autoFocus = false },
    ref: React.Ref<TextInput>
  ) => {
    const { t } = useTranslation()

    const theme = useHekaTheme()
    const styles = useStyles(theme)
    const { TextTheme, ColorPallet, Spacing } = theme

    const [showPIN, setShowPIN] = useState(false)

    return (
      <View style={styles.container}>
        <View>
          {label && <Text style={{ ...TextTheme.labelTitle, marginBottom: Spacing.md }}>{label}</Text>}
          <CodeField
            accessible
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            value={value}
            onChangeText={onPINChanged}
            cellCount={minPINLength}
            keyboardType="numeric"
            textContentType="password"
            showSoftInputOnFocus={!disableKeyboard}
            renderCell={({ index, symbol }) => {
              const hasValue = !!symbol
              const hasPreviousValue = !!value.charAt(index - 1)
              const isSelected = hasPreviousValue || index === 0

              const hideBorder = hasValue && showPIN
              const activeBorder = hasValue || isSelected
              const fillBackground = hasValue && !showPIN

              let cellStyle: StyleProp<ViewStyle> = styles.cell

              if (showPIN) {
                cellStyle = { ...cellStyle, ...styles.showPINCell }
              }

              if (hideBorder) {
                cellStyle = { ...cellStyle, borderColor: 'transparent' }
              } else if (activeBorder) {
                cellStyle = { ...cellStyle, borderColor: theme.ColorPallet.brand.primary }
              }

              if (fillBackground) {
                cellStyle = { ...cellStyle, backgroundColor: theme.ColorPallet.brand.primary }
              }

              return (
                <View key={index} style={cellStyle}>
                  {showPIN && (
                    <Text style={styles.cellText} maxFontSizeMultiplier={1}>
                      {symbol}
                    </Text>
                  )}
                </View>
              )
            }}
            autoFocus={autoFocus}
            ref={ref}
          />
        </View>
        <IconButton
          accessibilityLabel={showPIN ? t('PINCreate.Hide') : t('PINCreate.Show')}
          testId={showPIN ? testIdWithKey('Hide') : testIdWithKey('Show')}
          onPress={() => setShowPIN(!showPIN)}
          iconName={showPIN ? 'eye-slash' : 'eye'}
          iconColor={ColorPallet.brand.primary}
          iconSize={PIN_CELL_SIZE}
          hitSlop={HIT_SLOP}
        />
      </View>
    )
  }
)

// Manually set component display name used in error messages
// Required to comply with 'react/display-name' ESLint rule as we're using 'forwardRef' HOC
// See https://github.com/jsx-eslint/eslint-plugin-react/issues/2269
PINInput.displayName = 'PINInput'
