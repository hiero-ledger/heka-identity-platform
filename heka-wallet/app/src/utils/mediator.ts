import type { HekaWalletAgent } from './agent'
import type { DidCommConnectionRecord } from '@credo-ts/didcomm'

import { GlobalLogger } from '@heka-wallet/shared'

const logger = GlobalLogger.createContextLogger('Mediator')

export const MEDIATOR_CONNECTION_TIMEOUT_MS = 10000

const MEDIATOR_LABEL = 'Cloud Mediator'

export interface MediatorConfig {
  invitationUrl?: string
  publicDid?: string
}

/**
 * Sets up the default mediator if the wallet has none yet. Never throws: without a mediator the
 * agent keeps working, but DIDComm messages to the wallet do not arrive until a later start succeeds.
 * @returns whether the agent has a default mediator
 */
export async function trySetupMediator(
  agent: HekaWalletAgent,
  { invitationUrl, publicDid }: MediatorConfig
): Promise<boolean> {
  try {
    const existingMediationRecord = await agent.didcomm.mediationRecipient.findDefaultMediator()
    if (existingMediationRecord) return true

    let connection: DidCommConnectionRecord
    if (invitationUrl) {
      connection = await connectWithInvitation(agent, invitationUrl)
    } else if (publicDid) {
      connection = await connectWithPublicDid(agent, publicDid)
    } else {
      logger.warn('No mediator configured (MEDIATOR_URL / MEDIATOR_PUBLIC_DID)')
      return false
    }

    const mediationRecord = await agent.didcomm.mediationRecipient.provision(connection)
    await agent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)
    return true
  } catch (error) {
    logger.warn('Mediator is unavailable, continuing without it:', (error as Error)?.stack ?? error)
    return false
  }
}

async function connectWithInvitation(agent: HekaWalletAgent, invitationUrl: string): Promise<DidCommConnectionRecord> {
  const invitation = await agent.didcomm.oob.parseInvitation(invitationUrl)

  const outOfBandRecord = await agent.didcomm.oob.findByReceivedInvitationId(invitation.id)
  if (outOfBandRecord) {
    const [connection] = await agent.didcomm.connections.findAllByOutOfBandId(outOfBandRecord.id)
    if (connection?.isReady) return connection

    // A failed earlier attempt leaves a connection that never completes; start over.
    if (connection) await agent.didcomm.connections.deleteById(connection.id)
    await agent.didcomm.oob.deleteById(outOfBandRecord.id)
  }

  const routing = await agent.didcomm.mediationRecipient.getRouting({ useDefaultMediator: false })
  const { connectionRecord } = await agent.didcomm.oob.receiveInvitation(invitation, { label: '', routing })
  if (!connectionRecord) {
    throw new Error('Mediator invitation did not create a connection')
  }

  return agent.didcomm.connections.returnWhenIsConnected(connectionRecord.id, {
    timeoutMs: MEDIATOR_CONNECTION_TIMEOUT_MS,
  })
}

async function connectWithPublicDid(
  agent: HekaWalletAgent,
  mediatorPublicDid: string
): Promise<DidCommConnectionRecord> {
  const { connectionRecord } = await agent.didcomm.oob.receiveImplicitInvitation({
    label: MEDIATOR_LABEL,
    did: mediatorPublicDid,
    alias: MEDIATOR_LABEL,
    autoAcceptConnection: true,
  })

  if (!connectionRecord) {
    throw new Error(`Failed to connect with mediator via public DID: ${mediatorPublicDid}`)
  }

  return agent.didcomm.connections.returnWhenIsConnected(connectionRecord.id, {
    timeoutMs: MEDIATOR_CONNECTION_TIMEOUT_MS,
  })
}
