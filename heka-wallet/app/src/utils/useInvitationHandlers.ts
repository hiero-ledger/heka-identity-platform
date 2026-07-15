import { TOKENS, useServices, connectFromScanOrDeepLink } from '@bifold/core'
import { ParsedInvitation, parseInvitationUrl } from '@bifold/core/src/utils/parsers'
import { useOptionalAgent } from '@bifold/react-hooks'
import { useNavigation } from '@react-navigation/core'
import { StackNavigationProp } from '@react-navigation/stack'
import { useCallback } from 'react'

import { RootStackParams, Screens, Stacks } from '../navigators/types'

export const useInvitationHandlers = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParams>>()

  const { agent } = useOptionalAgent()

  const [logger, { enableImplicitInvitations, enableReuseConnections }] = useServices([
    TOKENS.UTIL_LOGGER,
    TOKENS.CONFIG,
  ])

  const handleParsedInvitation = useCallback(
    async (parsedMessage: ParsedInvitation) => {
      if (parsedMessage.type === 'openid-credential-offer') {
        navigation.navigate(Stacks.OpenIdStack, {
          screen: Screens.OpenIdCredentialOffer,
          params: {
            offer: {
              uri: parsedMessage.format === 'url' ? (parsedMessage.data as string) : undefined,
              data: parsedMessage.format === 'parsed' ? JSON.stringify(parsedMessage.data) : undefined,
            },
          },
        })
      } else if (parsedMessage.type === 'openid-authorization-request') {
        navigation.navigate(Stacks.OpenIdStack, {
          screen: Screens.OpenIdPresentationRequest,
          params: {
            request: {
              uri: parsedMessage.format === 'url' ? (parsedMessage.data as string) : undefined,
              data: parsedMessage.format === 'parsed' ? JSON.stringify(parsedMessage.data) : undefined,
            },
          },
        })
      } else if (parsedMessage.type === 'didcomm') {
        const payload =
          parsedMessage.format === 'url' ? (parsedMessage.data as string) : JSON.stringify(parsedMessage.data)
        await connectFromScanOrDeepLink(
          payload,
          agent,
          logger,
          navigation?.getParent(),
          false,
          enableImplicitInvitations,
          enableReuseConnections
        )
      }
    },
    [navigation, agent, logger, enableImplicitInvitations, enableReuseConnections]
  )

  const handleInvitationUrl = useCallback(
    async (invitationUrl: string) => {
      const invitationParsingResult = await parseInvitationUrl(invitationUrl)

      if (invitationParsingResult.success) {
        await handleParsedInvitation(invitationParsingResult.result)
      } else {
        throw new Error('Invitation message is not recognized')
      }
    },
    [handleParsedInvitation]
  )

  return { handleInvitationUrl }
}
