import React from 'react'
import { StyleSheet, TextStyle, ViewStyle } from 'react-native'
import { createIconSet } from 'react-native-vector-icons'

import { ColorPallet, IconSizes } from '../../theme'

import bootstrapIconsMap from './BootstrapIcons.json'
const Icon = createIconSet(bootstrapIconsMap, 'bootstrap-icons')

export type IconName = keyof typeof bootstrapIconsMap

const styles = StyleSheet.create({
  normal: {
    backgroundColor: 'transparent',
  },
})

interface Props {
  name: IconName
  color?: string
  size?: number
  onPress?: () => void
  style?: ViewStyle | TextStyle
  rtlReverse?: boolean
}

export const BootstrapIcon: React.FC<Props> = ({
  name,
  color = ColorPallet.grayscale.white,
  size = IconSizes.medium,
  onPress,
  style,
}) => {
  return <Icon name={name} size={size} color={color} style={{ ...style, ...styles.normal }} onPress={onPress} />
}
