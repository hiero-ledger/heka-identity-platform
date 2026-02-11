import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { PropsWithChildren, ReactElement } from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'

const useStyles = ({ ColorPallet, BorderRadius, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: ColorPallet.grayscale.white,
      borderRadius: BorderRadius.bigger,
      paddingVertical: Spacing.xs,
      width: '100%',
      minHeight: 100,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.xl,
    },
    content: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.md,
    },
  })

interface Props {
  title: string
  containerStyle?: ViewStyle
  contentViewStyle?: ViewStyle
  headerRightComponent?: ReactElement
}

export const SectionCard: React.FC<PropsWithChildren<Props>> = ({
  title,
  containerStyle,
  contentViewStyle,
  headerRightComponent,
  children,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { TextTheme } = theme

  return (
    <View style={{ ...styles.container, ...containerStyle }}>
      <View style={styles.header}>
        <Text style={TextTheme.normal}>{title}</Text>
        {headerRightComponent}
      </View>
      <View style={{ ...styles.content, ...contentViewStyle }}>{children}</View>
    </View>
  )
}
