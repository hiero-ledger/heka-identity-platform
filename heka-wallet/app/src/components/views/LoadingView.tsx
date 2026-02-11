import { useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native'
import { Modal, Portal } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

const DEFAULT_INDICATOR_SIZE = 200

const useStyles = (height?: number) => {
  const { LoadingTheme } = useHekaTheme()

  return StyleSheet.create({
    container: {
      minHeight: height,
      width: '100%',
      flexDirection: 'column',
      justifyContent: 'center',
      alignSelf: 'center',
      backgroundColor: LoadingTheme.backgroundColor,
    },
    loader: {
      color: '#FFE5CF',
    },
  })
}

const LoadingView: React.FC = () => {
  const { height } = useWindowDimensions()
  const styles = useStyles(height)

  return (
    <SafeAreaView style={styles.container}>
      <Loader />
    </SafeAreaView>
  )
}

interface LoaderProps {
  size?: number
}

export const Loader: React.FC<LoaderProps> = ({ size }: LoaderProps) => {
  const styles = useStyles()

  return <ActivityIndicator size={size ?? DEFAULT_INDICATOR_SIZE} color={styles.loader.color} />
}

export default LoadingView

export const LoaderModal: React.FC = () => {
  return (
    <Portal theme={{ colors: { backdrop: 'rgba(0,0,0, 0.5)' } }}>
      <Modal visible dismissable={false} style={{ backgroundColor: 'transparent' }}>
        <Loader />
      </Modal>
    </Portal>
  )
}
