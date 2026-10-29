import type { HekaWalletAgent } from './agent'
import type { DidCommConnectionRecord, DidCommMediationRecord } from '@credo-ts/didcomm'

import { DidCommMediationRepository } from '@credo-ts/didcomm'
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

    const mediationRecord = await provisionMediation(agent, connection)
    await agent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)
    return true
  } catch (error) {
    logger.warn('Mediator is unavailable, continuing without it:', (error as Error)?.stack ?? error)
    return false
  }
}

/**
 * Credo's provision() returns an existing mediation record as is and sets the default mediator only on a fresh
 * grant. A grant that timed out on an earlier start leaves a Requested record on the reused connection.
 */
async function provisionMediation(
  agent: HekaWalletAgent,
  connection: DidCommConnectionRecord
): Promise<DidCommMediationRecord> {
  const { mediationRecipient } = agent.didcomm

  const existingRecord = await mediationRecipient.findByConnectionId(connection.id)
  if (existingRecord && !existingRecord.isReady) {
    // Drop the unfinished request so provision() requests mediation again.
    await agent.dependencyManager.resolve(DidCommMediationRepository).delete(agent.context, existingRecord)
  }

  const mediationRecord = await mediationRecipient.provision(connection)
  if (!mediationRecord.isReady) {
    throw new Error(`Mediation is ${mediationRecord.state}, not granted`)
  }

  // A grant that arrived after the timeout is ready but not the default yet.
  const defaultMediator = await mediationRecipient.findDefaultMediator()
  if (defaultMediator?.id !== mediationRecord.id) {
    await mediationRecipient.setDefaultMediator(mediationRecord)
  }

  return mediationRecord
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
