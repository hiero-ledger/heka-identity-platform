import { Screens as BifoldScreens, TabStacks as BifoldTabStacks } from '@bifold/core'
import { ConfirmationInputModal, ConfirmationInputType } from '@heka-wallet/shared'
import { StackScreenProps } from '@react-navigation/stack'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CredentialOfferView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import { useOpenIdCredentialOffer } from '../hooks/useOpenIdCredentialOffer'
import { OpenIdStackParams, Screens } from '../navigators/types'

type CredentialOfferProps = StackScreenProps<OpenIdStackParams, Screens.OpenIdCredentialOffer>

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/CredentialOffer.tsx
export const OpenIdCredentialOffer: React.FC<CredentialOfferProps> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('OpenIdCredentialOffer route params were not set properly')
  }

  const { t } = useTranslation()

  const { offer } = route.params

  const navigateToHome = useCallback(() => {
    navigation.getParent()?.navigate(BifoldTabStacks.HomeStack, { screen: BifoldScreens.Home })
  }, [navigation])

  const {
    credential,
    isLoading,
    isAccepted,
    isCredentialPinInputVisible,
    accept,
    confirmCredentialPin,
    cancelCredentialPin,
  } = useOpenIdCredentialOffer(offer, { onFailed: navigateToHome })

  const onDecline = async () => {
    // TODO: Send 'credential_deleted' notification to issuer
    // See https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-notification-endpoint
    navigateToHome()
  }

  const onCredentialPinCancel = () => {
    cancelCredentialPin()
    navigateToHome()
  }

  // Rendered while loading too: the credential is requested only after the PIN is entered.
  const credentialPinModal = (
    <ConfirmationInputModal
      title={t('CredentialOffer.EnterCredentialPIN')}
      inputType={ConfirmationInputType.Password}
      inputLabel={t('Common.Code')}
      isVisible={isCredentialPinInputVisible}
      doneButtonTitle={t('Global.Confirm')}
      onConfirm={confirmCredentialPin}
      onCancel={onCredentialPinCancel}
    />
  )

  if (isLoading || !credential) {
    return (
      <>
        <LoadingView />
        {credentialPinModal}
      </>
    )
  }

  return (
    <SafeAreaView style={{ flexGrow: 1 }} edges={['bottom', 'left', 'right']}>
      <CredentialOfferView
        credential={credential}
        onAccept={accept}
        onDecline={onDecline}
        isAccepted={isAccepted}
        isUseBackAsDecline={true}
      />
      {credentialPinModal}
    </SafeAreaView>
  )
}
