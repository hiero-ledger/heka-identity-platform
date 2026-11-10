import { Button, ButtonType, DispatchAction, Screens, useStore } from '@bifold/core'
import { hour, minute, second } from '@bifold/core/src/constants'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { useNavigation, CommonActions } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import SafeImage from '../assets/safe.svg'

interface Timer {
  hours: number
  minutes: number
  seconds: number
}

const LOCKOUT_TICK_MS = second

// Time left until the lockout ends, or undefined when it is over
const getTimeRemaining = (lockoutDate?: number): Timer | undefined => {
  if (!lockoutDate) return undefined

  let diff = lockoutDate - Date.now()
  if (diff <= 0) return undefined

  const hours = Math.floor(diff / hour)
  diff -= hours * hour

  const minutes = Math.floor(diff / minute)
  diff -= minutes * minute

  return { hours, minutes, seconds: Math.floor(diff / second) }
}

const useStyles = ({ TextTheme, ColorPalette, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    screenContainer: {
      height: '100%',
      backgroundColor: ColorPalette.brand.primaryBackground,
      padding: Spacing.lg,
      justifyContent: 'space-between',
    },
    textContainer: {
      marginVertical: Spacing.lg,
    },
    textTitle: TextTheme.headingFour,
    textDetails: TextTheme.normal,
    imageContainer: {
      minHeight: 240,
      alignItems: 'center',
      marginVertical: Spacing.xxxl,
    },
    tryAgain: {
      ...TextTheme.normal,
      textAlign: 'left',
    },
    countDown: {
      ...TextTheme.bold,
      textAlign: 'left',
    },
  })
}

const AttemptLockout: React.FC = () => {
  const navigation = useNavigation()
  const { t } = useTranslation()
  const [state, dispatch] = useStore()

  const [time, setTime] = useState<Timer>()
  const [timeoutDone, setTimeoutDone] = useState<boolean>(false)

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const lockoutDate = state.loginAttempt.lockoutDate

  useEffect(() => {
    // Returns true once the lockout penalty is served
    const updateTimeRemaining = (): boolean => {
      const remaining = getTimeRemaining(lockoutDate)
      setTime(remaining)
      setTimeoutDone(!remaining)
      return !remaining
    }

    if (updateTimeRemaining()) return

    const interval = setInterval(() => {
      if (updateTimeRemaining()) clearInterval(interval)
    }, LOCKOUT_TICK_MS)

    return () => clearInterval(interval)
  }, [lockoutDate])

  const unlock = async () => {
    dispatch({
      type: DispatchAction.ATTEMPT_UPDATED,
      payload: [{ loginAttempts: state.loginAttempt.loginAttempts, lockoutDate: undefined, servedPenalty: true }],
    })
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: Screens.EnterPIN }],
      })
    )
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']}>
      <View style={styles.screenContainer}>
        <View style={styles.textContainer}>
          <Text style={styles.textTitle}>{t('AttemptLockout.Title')}</Text>
          <View style={styles.imageContainer}>
            <SafeImage />
          </View>
          <Text style={styles.textDetails}>{t('AttemptLockout.Description')}</Text>
        </View>
        {timeoutDone ? (
          <Button
            title={t('Global.TryAgain')}
            buttonType={ButtonType.Primary}
            accessibilityLabel={t('Global.TryAgain')}
            onPress={unlock}
          />
        ) : (
          <View>
            <Text style={styles.tryAgain}>{t('AttemptLockout.TryAgain')}</Text>
            {time && (
              <Text style={styles.countDown}>
                {time?.hours} {t('AttemptLockout.Hours')} {time?.minutes} {t('AttemptLockout.Minutes')} {time?.seconds}{' '}
                {t('AttemptLockout.Seconds')}
              </Text>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

export default AttemptLockout
