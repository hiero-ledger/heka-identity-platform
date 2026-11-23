import { testIdWithKey } from '@bifold/core'
import { minPINLength } from '@bifold/core/src/constants'
import { GlobalLogger, HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'

import DeleteIcon from '../../assets/delete.svg'

const logger = GlobalLogger.createContextLogger('PinKeyPad')

// Window height (dp) below which the full-size key pad leaves no room for the screen title above it.
export const COMPACT_KEYPAD_WINDOW_HEIGHT = 720

const useStyles = ({ ColorPalette, TextTheme, Spacing, BorderRadius }: HekaTheme, compact: boolean) => {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinIndicatorContainer: {
      paddingVertical: Spacing.xxl,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dot: {
      marginHorizontal: Spacing.xs,
      width: Spacing.sm,
      height: Spacing.sm,
      borderRadius: BorderRadius.medium,
      backgroundColor: ColorPalette.brand.secondary,
    },
    itemContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: Spacing.xxl,
      marginVertical: compact ? Spacing.sm : Spacing.xxl,
      width: Spacing.xxxl,
      height: Spacing.xxxl,
    },
    itemText: TextTheme.headingTwo,
  })
}

const deleteSymbol = 'x'
const content = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', deleteSymbol]

interface KeyPadProps {
  onPinEntered: (value: string) => Promise<boolean>
}

const PinKeyPad: React.FC<KeyPadProps> = ({ onPinEntered }: KeyPadProps) => {
  const theme = useHekaTheme()
  const { height } = useWindowDimensions()
  const styles = useStyles(theme, height < COMPACT_KEYPAD_WINDOW_HEIGHT)

  const [PIN, setPIN] = useState('')
  // Keys stay disabled until the handler settles, so a newer entry cannot be cleared by an older result
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onPinChanged = useCallback((value: string) => {
    setPIN((prev) => {
      if (value === deleteSymbol) {
        return prev.slice(0, -1)
      } else {
        return prev + value
      }
    })
  }, [])

  // A failed attempt updates the store and so the handler; a new handler must not resubmit the same PIN.
  const onPinEnteredRef = useRef(onPinEntered)
  useEffect(() => {
    onPinEnteredRef.current = onPinEntered
  }, [onPinEntered])

  useEffect(() => {
    if (PIN.length === minPINLength) {
      setIsSubmitting(true)
      onPinEnteredRef
        .current(PIN)
        .then((valid) => {
          if (!valid) setPIN('')
        })
        .catch((error: unknown) => {
          logger.error('PIN entry handler failed', error)
          setPIN('')
        })
        .finally(() => setIsSubmitting(false))
    }
  }, [PIN])

  return (
    <View style={styles.container}>
      <View style={styles.pinIndicatorContainer}>
        {Array.from(Array(minPINLength).keys()).map((index) => (
          <View
            key={index}
            style={{
              ...styles.dot,
              backgroundColor:
                index < PIN.length ? theme.ColorPalette.brand.primary : theme.ColorPalette.brand.primaryDisabled,
            }}
          />
        ))}
      </View>
      <FlatList
        data={content}
        numColumns={3}
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item }) => {
          return (
            <TouchableOpacity
              disabled={item === '' || isSubmitting} // '' is the empty space
              onPress={() => onPinChanged(item)}
              testID={testIdWithKey(item === deleteSymbol ? 'PinKeyDelete' : `PinKey${item}`)}
            >
              <View style={styles.itemContainer}>
                {item === deleteSymbol ? <DeleteIcon /> : <Text style={styles.itemText}>{item}</Text>}
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

export default PinKeyPad
