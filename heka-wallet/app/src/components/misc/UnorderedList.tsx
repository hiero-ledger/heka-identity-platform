import { ThemedText } from '@bifold/core'
import { useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { View } from 'react-native'

type UnorderedListProps = {
  unorderedListItems: string[]
}

export const UnorderedList: React.FC<UnorderedListProps> = ({ unorderedListItems }) => {
  const { ColorPalette } = useHekaTheme()

  return (
    <>
      {unorderedListItems.map((item: string, i: number) => {
        return (
          <View key={i} style={{ display: 'flex', flexDirection: 'row', marginBottom: 5 }}>
            <ThemedText style={{ color: ColorPalette.brand.unorderedList, paddingLeft: 5 }}>{'\u2022'}</ThemedText>
            <ThemedText style={{ color: ColorPalette.brand.unorderedList, paddingLeft: 5, flex: 1 }}>{item}</ThemedText>
          </View>
        )
      })}
    </>
  )
}
