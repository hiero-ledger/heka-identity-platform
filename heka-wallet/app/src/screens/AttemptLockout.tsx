import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType, DispatchAction, Screens, useStore } from '@hyperledger/aries-bifold-core'
import { hour, minute, second } from '@hyperledger/aries-bifold-core/App/constants'
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

const useStyles = ({ TextTheme, ColorPallet, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    screenContainer: {
      height: '100%',
      backgroundColor: ColorPallet.brand.primaryBackground,
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

  // update the countdown timer. Return true if the lockout penalty time is over
  const updateTimeRemaining = (): boolean => {
    let penaltyServed = true
    const penalty = state.loginAttempt.lockoutDate
    const currDate = Date.now()
    if (penalty) {
      let diff = penalty - currDate
      if (diff > 0) {
        penaltyServed = false
        const hoursLeft = Math.floor(diff / hour)
        diff = diff - hoursLeft * hour

        const minutesLeft = Math.floor(diff / minute)
        diff = diff - minutesLeft * minute

        const secondsLeft = Math.floor(diff / second)
        const timer: Timer = {
          hours: hoursLeft,
          minutes: minutesLeft,
          seconds: secondsLeft,
        }
        setTime(timer)
      }
    }
    return penaltyServed
  }

  // run once immediately at screen initialization
  useEffect(() => {
    setTimeoutDone(updateTimeRemaining())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // make sure set timeout only runs once
  useEffect(() => {
    const updateTimer = setTimeout(() => {
      // calculate time remaining
      const timerDone = updateTimeRemaining()
      setTimeoutDone(timerDone)
      if (timerDone) {
        clearInterval(updateTimer)
      }
    }, 1000)
  })

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
