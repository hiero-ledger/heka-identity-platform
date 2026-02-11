import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { minPINLength } from '@hyperledger/aries-bifold-core/App/constants'
import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import DeleteIcon from '../../assets/delete.svg'

export const useStyles = ({ ColorPallet, TextTheme, Spacing, BorderRadius }: HekaTheme) => {
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
      backgroundColor: ColorPallet.brand.secondary,
    },
    itemContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      margin: Spacing.xxl,
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
  const styles = useStyles(theme)

  const [PIN, setPIN] = useState('')

  const onPinChanged = useCallback((value: string) => {
    setPIN((prev) => {
      if (value === deleteSymbol) {
        return prev.slice(0, -1)
      } else {
        return prev + value
      }
    })
  }, [])

  useEffect(() => {
    if (PIN.length === minPINLength) {
      onPinEntered(PIN).then((valid) => {
        if (!valid) setPIN('')
      })
    }
  }, [PIN, onPinEntered])

  return (
    <View style={styles.container}>
      <View style={styles.pinIndicatorContainer}>
        {Array.from(Array(minPINLength).keys()).map((index) => (
          <View
            key={index}
            style={{
              ...styles.dot,
              backgroundColor:
                index < PIN.length ? theme.ColorPallet.brand.primary : theme.ColorPallet.brand.primaryDisabled,
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
              disabled={item === ''} // empty space
              onPress={() => onPinChanged(item)}
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
