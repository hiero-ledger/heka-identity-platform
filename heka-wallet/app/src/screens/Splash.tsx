import { DispatchAction, Stacks, useAuth, useStore, TOKENS, EventTypes, BifoldError, useServices } from '@bifold/core'
import { DidCommHttpOutboundTransport, DidCommWsOutboundTransport } from '@credo-ts/didcomm'
import { useNavigation } from '@react-navigation/core'
import { CommonActions } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'
import { Config } from 'react-native-config'

import LoadingView from '../components/views/LoadingView'
import { indyBesuConfig, isExampleCredentialEnabled, isPublicInvitationEnabled } from '../config'
import {
  createAgent,
  createPublicDidOrGetExisting,
  createPublicInvitationOrGetExisting,
  ensureExampleCredentialCreated,
  setupMediatorWithPublicDidIfNeeded,
  tryRestartExistingAgent,
  createAnoncredsLinkSecretIfRequired,
  useHekaAgent,
} from '../utils/agent'

/**
 * To customize this splash screen set the background color of the
 * iOS and Android launch screen to match the background color of this view.
 */
export const Splash: React.FC = () => {
  const { t } = useTranslation()

  const navigation = useNavigation()

  const [store, dispatch] = useStore()
  const { agent, setAgent, setPublicDid } = useHekaAgent()
  const { getWalletSecret } = useAuth()

  const [indyLedgers, logger] = useServices([TOKENS.UTIL_LEDGERS, TOKENS.UTIL_LOGGER])

  const [mounted, setMounted] = useState(false)

  // navigation calls that occur before the screen is fully mounted will fail
  // this useEffect prevents that race condition
  useEffect(() => {
    setMounted(true)
  }, [])

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
        const walletSecret = await getWalletSecret()
        if (!walletSecret?.key) {
          logger.warn('Wallet secret is not defined')
          return
        }

        if (agent) {
          logger.info('Agent already initialized, restarting...')

          const isAgentRestarted = await tryRestartExistingAgent(agent, walletSecret)

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
          walletSecret,
          indyLedgers,
          indyBesuConfig,
        })

        const wsTransport = new DidCommWsOutboundTransport()
        const httpTransport = new DidCommHttpOutboundTransport()

        newAgent.didcomm.registerOutboundTransport(wsTransport)
        newAgent.didcomm.registerOutboundTransport(httpTransport)

        await newAgent.initialize()

        await createAnoncredsLinkSecretIfRequired(newAgent)

        // We don't need to use Indy -> Askar migration, but still need to set a flag that migration is complete
        // Otherwise, we may get side effects from Bifold side
        if (!store.migration.didMigrateToAskar) {
          dispatch({
            type: DispatchAction.DID_MIGRATE_TO_ASKAR,
          })
        }

        if (Config.MEDIATOR_PUBLIC_DID) {
          await setupMediatorWithPublicDidIfNeeded(newAgent, Config.MEDIATOR_PUBLIC_DID)
        }

        const publicDid = await createPublicDidOrGetExisting(newAgent)
        logger.info(`Public DID: ${publicDid}`)

        if (isPublicInvitationEnabled) {
          const invitationUrl = await createPublicInvitationOrGetExisting(
            newAgent,
            publicDid,
            store.preferences.walletName ?? 'Heka Wallet'
          )
          logger.info(`Public invitation URL: ${invitationUrl}`)
        }

        if (isExampleCredentialEnabled) {
          await ensureExampleCredentialCreated(newAgent)
        }

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
