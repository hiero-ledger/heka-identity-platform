import { HttpOutboundTransport, WsOutboundTransport } from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import {
  DispatchAction,
  Screens,
  Stacks,
  OnboardingState,
  useAuth,
  useStore,
  createLinkSecretIfRequired,
  TOKENS,
  EventTypes,
  BifoldError,
  useServices,
} from '@hyperledger/aries-bifold-core'
import { useNavigation } from '@react-navigation/core'
import { CommonActions } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import LoadingView from '../components/views/LoadingView'
import { indyBesuConfig, publicDidKeyOptions } from '../config'
import { createAgent, createPublicDidOrGetExisting, tryRestartExistingAgent } from '../utils/agent'

const OnboardingVersion = 1

const onboardingComplete = (state: OnboardingState): boolean => {
  return (
    (state.onboardingVersion !== 0 && state.didCompleteOnboarding) ||
    (state.onboardingVersion === 0 && state.didConsiderBiometry)
  )
}

const resumeOnboardingAt = (
  state: OnboardingState,
  params: { enableWalletNaming?: boolean; showPreface?: boolean; termsVersion?: boolean | string }
): Screens => {
  const termsVer = params.termsVersion ?? true
  if (
    (state.didSeePreface || !params.showPreface) &&
    state.didCompleteTutorial &&
    state.didAgreeToTerms === termsVer &&
    state.didCreatePIN &&
    (state.didNameWallet || !params.enableWalletNaming) &&
    !state.didConsiderBiometry
  ) {
    return Screens.UseBiometry
  }

  if (
    (state.didSeePreface || !params.showPreface) &&
    state.didCompleteTutorial &&
    state.didAgreeToTerms === termsVer &&
    state.didCreatePIN &&
    params.enableWalletNaming &&
    !state.didNameWallet
  ) {
    return Screens.NameWallet
  }

  if (
    (state.didSeePreface || !params.showPreface) &&
    state.didCompleteTutorial &&
    state.didAgreeToTerms === termsVer &&
    !state.didCreatePIN
  ) {
    return Screens.CreatePIN
  }

  if ((state.didSeePreface || !params.showPreface) && state.didCompleteTutorial && state.didAgreeToTerms !== termsVer) {
    return Screens.Terms
  }

  if (state.didSeePreface || !params.showPreface) {
    return Screens.Onboarding
  }

  console.error('Preface navigation has been triggered', JSON.stringify(state))
  return Screens.Preface
}

/**
 * To customize this splash screen set the background color of the
 * iOS and Android launch screen to match the background color of this view.
 */
export const Splash: React.FC = () => {
  const { t } = useTranslation()

  const navigation = useNavigation()

  const [store, dispatch] = useStore()
  const { agent, setAgent, setPublicDid } = useAgent()
  const { getWalletCredentials } = useAuth()

  const [{ version: TermsVersion }, indyLedgers, { showPreface, enablePushNotifications }, logger] = useServices([
    TOKENS.SCREEN_TERMS,
    TOKENS.UTIL_LEDGERS,
    TOKENS.CONFIG,
    TOKENS.UTIL_LOGGER,
  ])

  const [mounted, setMounted] = useState(false)

  // navigation calls that occur before the screen is fully mounted will fail
  // this useEffect prevents that race condition
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || store.authentication.didAuthenticate) {
      return
    }

    const initOnboarding = async (): Promise<void> => {
      try {
        // load authentication attempts from storage
        if (!store.stateLoaded) {
          return
        }

        if (store.onboarding.onboardingVersion !== OnboardingVersion) {
          dispatch({ type: DispatchAction.ONBOARDING_VERSION, payload: [OnboardingVersion] })
        }

        if (onboardingComplete(store.onboarding)) {
          if (store.onboarding.onboardingVersion !== OnboardingVersion) {
            dispatch({ type: DispatchAction.ONBOARDING_VERSION, payload: [OnboardingVersion] })
          }
          // if they previously completed onboarding before wallet naming was enabled, mark complete
          if (!store.onboarding.didNameWallet) {
            dispatch({ type: DispatchAction.DID_NAME_WALLET, payload: [true] })
          }

          // if they previously completed onboarding before preface was enabled, mark seen
          if (!store.onboarding.didSeePreface) {
            dispatch({ type: DispatchAction.DID_SEE_PREFACE })
          }

          // add post authentication screens
          const postAuthScreens = []
          if (store.onboarding.didAgreeToTerms !== TermsVersion) {
            postAuthScreens.push(Screens.Terms)
          }
          if (!store.onboarding.didConsiderPushNotifications && enablePushNotifications) {
            postAuthScreens.push(Screens.UsePushNotifications)
          }
          dispatch({ type: DispatchAction.SET_POST_AUTH_SCREENS, payload: [postAuthScreens] })

          if (!store.loginAttempt.lockoutDate) {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: Screens.EnterPIN }],
              })
            )
          } else {
            // return to lockout screen if lockout date is set
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: Screens.AttemptLockout }],
              })
            )
          }
          return
        } else {
          // If onboarding was interrupted we need to pickup from where we left off.
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [
                {
                  name: resumeOnboardingAt(store.onboarding, {
                    enableWalletNaming: store.preferences.enableWalletNaming,
                    showPreface,
                    termsVersion: TermsVersion,
                  }),
                },
              ],
            })
          )
        }
      } catch (err: unknown) {
        const error = new BifoldError(
          t('Error.Title1044'),
          t('Error.Message1044'),
          (err as Error)?.message ?? err,
          1044
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      }
    }

    initOnboarding()
  }, [
    navigation,
    dispatch,
    store.onboarding.didNameWallet,
    store.preferences.enableWalletNaming,
    store.authentication.didAuthenticate,
    mounted,
    store.stateLoaded,
    store.onboarding,
    store.loginAttempt.lockoutDate,
    TermsVersion,
    enablePushNotifications,
    showPreface,
    t,
  ])

  useEffect(() => {
    if (
      !mounted ||
      !store.authentication.didAuthenticate ||
      !store.onboarding.didConsiderBiometry ||
      agent?.isInitialized
    ) {
      return
    }

    const initAgent = async (): Promise<void> => {
      try {
        const credentials = await getWalletCredentials()
        if (!credentials?.key) {
          logger.warn('Wallet credentials are not defined')
          return
        }

        if (agent) {
          logger.info('Agent already initialized, restarting...')

          const isAgentRestarted = await tryRestartExistingAgent(agent, credentials)

          if (isAgentRestarted) {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: Stacks.TabStack }],
              })
            )
            return
          }
        }

        logger.info('No agent initialized, creating a new one')

        const newAgent = await createAgent({
          credentials,
          indyLedgers,
          indyBesuConfig,
          walletName: store.preferences.walletName,
        })

        const wsTransport = new WsOutboundTransport()
        const httpTransport = new HttpOutboundTransport()

        newAgent.registerOutboundTransport(wsTransport)
        newAgent.registerOutboundTransport(httpTransport)

        await newAgent.initialize()

        await createLinkSecretIfRequired(newAgent)

        // We don't need to use Indy -> Askar migration, but still need to set a flag that migration is complete
        // Otherwise, we may get side effects from Bifold side
        if (!store.migration.didMigrateToAskar) {
          dispatch({
            type: DispatchAction.DID_MIGRATE_TO_ASKAR,
          })
        }

        const publicDid = await createPublicDidOrGetExisting(newAgent, publicDidKeyOptions)
        logger.info(`Public did:key: ${publicDid}`)

        setAgent(newAgent)
        setPublicDid(publicDid)

        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: Stacks.TabStack }],
          })
        )
      } catch (err: unknown) {
        const error = new BifoldError(
          t('Error.Title1045'),
          t('Error.Message1045'),
          (err as Error)?.message ?? err,
          1045
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      }
    }

    initAgent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    t,
    logger,
    navigation,
    agent,
    dispatch,
    indyLedgers,
    mounted,
    store.authentication.didAuthenticate,
    store.onboarding.didConsiderBiometry,
    store.preferences.walletName,
    store.migration.didMigrateToAskar,
  ])
  // Here 'getWalletCredentials', 'setAgent' and 'setPublicDid' are not placed in useEffect dependencies intentionally
  // The reason is that their implementation is not wrapped in useCallback and may cause updates on every re-render

  return <LoadingView />
}
