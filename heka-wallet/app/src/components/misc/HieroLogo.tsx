import { useHekaTheme, useGlobalStyles } from '@heka-wallet/shared'
import React from 'react'
import { View } from 'react-native'
import { SvgProps } from 'react-native-svg'

export const HieroLogo: React.FC<SvgProps> = (svgProps) => {
  const { Assets } = useHekaTheme()
  const globalStyles = useGlobalStyles()

  const { logo: SvgLogo } = Assets.svg

  return (
    <View style={globalStyles.logoContainer}>
      <SvgLogo style={{ marginBottom: 20 }} width={150} height={50} {...svgProps} />
    </View>
  )
}
