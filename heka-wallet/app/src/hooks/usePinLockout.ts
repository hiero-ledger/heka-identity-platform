import { attemptLockoutConfig, DispatchAction, Screens, useStore } from '@bifold/core'
import { CommonActions, useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useRef, useState } from 'react'

export const getLockoutPenalty = (attempts: number): number | undefined => {
  let penalty = attemptLockoutConfig.baseRules[attempts]
  if (
    !penalty &&
    attempts >= attemptLockoutConfig.thresholdRules.threshold &&
    !(attempts % attemptLockoutConfig.thresholdRules.increment)
  ) {
    penalty = attemptLockoutConfig.thresholdRules.thresholdPenaltyDuration
  }
  return penalty
}

interface PinLockout {
  // True when the next wrong PIN locks the wallet out.
  displayLockoutWarning: boolean
}

// Applies Bifold's attempt lockout penalty on the login attempt counter in the store.
export const usePinLockout = (): PinLockout => {
  const [store, dispatch] = useStore()
  const navigation = useNavigation()
  const [displayLockoutWarning, setDisplayLockoutWarning] = useState(false)

  const attemptLockout = useCallback(
    (penalty: number) => {
      // set the attempt lockout time
      dispatch({
        type: DispatchAction.ATTEMPT_UPDATED,
        payload: [
          { loginAttempts: store.loginAttempt.loginAttempts, lockoutDate: Date.now() + penalty, servedPenalty: false },
        ],
      })
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: Screens.AttemptLockout }],
        })
      )
    },
    [dispatch, navigation, store.loginAttempt.loginAttempts]
  )

  // attemptLockout sets servedPenalty to false, which re-runs the effect below; lock out once per attempt count.
  const lockoutAppliedAtRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    // check number of login attempts and determine if app should apply lockout
    const attempts = store.loginAttempt.loginAttempts
    const penalty = getLockoutPenalty(attempts)
    if (penalty && !store.loginAttempt.servedPenalty && lockoutAppliedAtRef.current !== attempts) {
      // only apply lockout if user has not served their penalty
      lockoutAppliedAtRef.current = attempts
      attemptLockout(penalty)
    }

    // display warning if we are one away from a lockout
    const displayWarning = !!getLockoutPenalty(attempts + 1)
    setDisplayLockoutWarning(displayWarning)
  }, [store.loginAttempt.loginAttempts, store.loginAttempt.servedPenalty, attemptLockout])

  return { displayLockoutWarning }
}
