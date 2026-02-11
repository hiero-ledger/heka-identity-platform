import React, { ReactElement } from 'react'
import { Text, TouchableOpacity, View, StyleSheet, ViewStyle, TextStyle } from 'react-native'

import { HekaTheme, useHekaTheme } from '../../theme'
import { BootstrapIcon } from '../icons'

// Based on https://github.com/RidicZhi/react-native-numeric-pad

const BUTTON_HEIGHT = 50
const BUTTON_ACTIVE_OPACITY = 0.5

const NUM_PAD_BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'] as const

const useStyles = ({ TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
      alignItems: 'center',
      paddingVertical: Spacing.xl,
    },
    buttonPanel: {
      alignItems: 'center',
      alignContent: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    buttonContainer: {
      marginBottom: Spacing.xs,
      width: '33%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonView: {
      textAlign: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      ...TextTheme.headingThree,
      textAlign: 'center',
      fontFamily: 'DMMono',
    },
  })

interface NumpadProps {
  value: string
  onValueChange: (value: string) => void
  numLength: number
  allowDecimal?: boolean
  containerStyle?: ViewStyle
  buttonPanelStyle?: ViewStyle
  buttonStyle?: ViewStyle
  buttonTextStyle?: TextStyle
  disabled?: boolean
}

export const Numpad: React.FC<NumpadProps> = ({
  value,
  numLength,
  allowDecimal,
  onValueChange,
  containerStyle,
  buttonPanelStyle,
  buttonStyle,
  buttonTextStyle,
  disabled,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const onButtonPressHandle = (buttonValue: string) => {
    const dotButtonPressed = buttonValue === '.'
    const valueIncludesDot = value.includes('.')

    // Only one dot is allowed and it can't be a first symbol
    if (dotButtonPressed && (!value.length || valueIncludesDot)) return

    // There can be only two digits after the dot
    if (valueIncludesDot && value.substring(value.indexOf('.')).length === 3) return

    if (value.length < numLength) {
      onValueChange(value + '' + buttonValue)
    }
  }

  const onClearButtonPress = () => {
    onValueChange(value.slice(0, -1))
  }

  const EmptyButton = () => <View style={styles.buttonContainer} />
  return (
    <View style={{ ...styles.container, ...containerStyle }}>
      <View style={{ ...styles.buttonPanel, ...buttonPanelStyle }}>
        {NUM_PAD_BUTTONS.map((buttonValue) => {
          if (!allowDecimal && buttonValue === '.') {
            return <EmptyButton key={buttonValue} />
          }

          return (
            <NumpadButton
              key={buttonValue}
              text={buttonValue}
              onPress={() => onButtonPressHandle(buttonValue)}
              textStyle={buttonTextStyle}
              viewStyle={buttonStyle}
              disabled={disabled}
            />
          )
        })}
        <NumpadButton
          onPress={onClearButtonPress}
          customComponent={<BootstrapIcon name={'chevron-left'} />}
          accessibilityLabel={'clearButton'}
          disabled={disabled}
        />
      </View>
    </View>
  )
}

interface NumpadButtonProps {
  text?: string
  onPress: () => void
  customComponent?: ReactElement
  viewStyle?: ViewStyle
  textStyle?: TextStyle
  accessibilityLabel?: string
  disabled?: boolean
}

const NumpadButton: React.FC<NumpadButtonProps> = ({
  text,
  onPress,
  customComponent,
  accessibilityLabel,
  disabled,
  viewStyle,
  textStyle,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="keyboardkey"
      accessibilityLabel={accessibilityLabel ?? text}
      onPress={onPress}
      style={styles.buttonContainer}
      activeOpacity={BUTTON_ACTIVE_OPACITY}
      disabled={disabled}
    >
      <View
        style={{
          ...styles.buttonView,
          height: BUTTON_HEIGHT,
          ...viewStyle,
        }}
      >
        {customComponent || <Text style={{ ...styles.buttonText, ...textStyle }}>{text}</Text>}
      </View>
    </TouchableOpacity>
  )
}
