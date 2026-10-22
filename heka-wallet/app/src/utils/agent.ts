import { getAgentModules, WalletSecret } from '@bifold/core'
import { useOptionalAgent } from '@bifold/react-hooks'
import {
  AnonCredsDidCommCredentialFormatService,
  AnonCredsDidCommProofFormatService,
  AnonCredsModule,
  DataIntegrityDidCommCredentialFormatService,
  DidCommCredentialV1Protocol,
  DidCommProofV1Protocol,
  LegacyIndyDidCommCredentialFormatService,
  LegacyIndyDidCommProofFormatService,
} from '@credo-ts/anoncreds'
import {
  Agent,
  DidsModule,
  JwkDidRegistrar,
  JwkDidResolver,
  KeyDidRegistrar,
  KeyDidResolver,
  PeerDidNumAlgo,
  PeerDidRegistrar,
  PeerDidResolver,
  SdJwtVcRecord,
  WebDidResolver,
  X509Module,
} from '@credo-ts/core'
import {
  DidCommAutoAcceptCredential,
  DidCommAutoAcceptProof,
  DidCommCredentialV2Protocol,
  DidCommDifPresentationExchangeProofFormatService,
  DidCommMediatorPickupStrategy,
  DidCommModule,
  DidCommOutOfBandRecord,
  DidCommProofV2Protocol,
} from '@credo-ts/didcomm'
import {
  createPeerDidFromServices,
  routingToServices,
  // @ts-expect-error - TODO: Resolve type import issues or move helpers implementation to project codebase
} from '@credo-ts/didcomm/build/modules/connections/services/helpers.mjs'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import { IndyVdrAnonCredsRegistry, IndyVdrPoolConfig } from '@credo-ts/indy-vdr'
import { agentDependencies } from '@credo-ts/react-native'
import { NativeAnoncreds } from '@hyperledger/anoncreds-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Config } from 'react-native-config'

import { OpenId4VcCredentialMetadata, setOpenId4VcCredentialMetadata } from '../credentials/metadata'
import { IndyBesuConfig, IndyBesuDidResolver } from '../indy-besu'
import { IndyBesuAnoncredsRegistry } from '../indy-besu/anoncreds'
import { CredoLogger } from '../logger'

import { getDidKeyVerificationMethodId } from './did'
import { TailsService } from './revocation/TailsService'

const PUBLIC_DID_KEY = 'PUBLIC_DID'

const PUBLIC_INVITATION_ID_KEY = 'PUBLIC_INVITATION_ID'

const MEDIATOR_CONNECTION_TIMEOUT_MS = 10000
const MEDIATION_GRANT_TIMEOUT_MS = 10000
const MEDIATOR_SETUP_RETRY_MIN_DELAY_MS = 5000
const MEDIATOR_SETUP_RETRY_MAX_DELAY_MS = 5 * 60 * 1000

const agentsWithMediatorSetupInProgress = new WeakSet<Agent>()
const mediatorSetupAttemptsInProgress = new WeakMap<Agent, Promise<void>>()

export const TRUSTED_X509_CERTIFICATES = [
  'MIIBwDCCAWWgAwIBAgIUSMdjaVc1KHI+3o6qJXhSC4sJh+cwCgYIKoZIzj0EAwIwNTEXMBUGA1UEAwwObURMIElzc3VlciBEZXYxDTALBgNVBAoMBEhla2ExCzAJBgNVBAYTAlVTMB4XDTI2MDMyNzIxNDA1NloXDTM2MDMyNDIxNDA1NlowNTEXMBUGA1UEAwwObURMIElzc3VlciBEZXYxDTALBgNVBAoMBEhla2ExCzAJBgNVBAYTAlVTMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1nIrm3O9VX8MdPrKWMhqqV0QMS4UtxKj6uUc8IdGE2fSsWyi7XQN3HoE1Ln9TDtOIHvSyW8Eyr98MlWGBBF/vqNTMFEwHQYDVR0OBBYEFNfkrHxd2nwtni96XrrYhaMgUFImMB8GA1UdIwQYMBaAFNfkrHxd2nwtni96XrrYhaMgUFImMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAP0V5EW7j6Pb+lJktzdWrtEqhI3mYs9Fd+qh0p2kNXJPAiEAqK+q7Wk+t5e2yzvO3b6t3P5nIEnoQt3cvDsaUZY1dT0=',
] as const

const EXAMPLE_CREDENTIAL_VCT = 'ExampleCredential'
const EXAMPLE_CREDENTIAL_METADATA: OpenId4VcCredentialMetadata = {
  issuer: {
    id: 'example-issuer-id',
    display: [{ name: 'DSR' }],
  },
  credential: {},
}

interface CreateAgentOptions {
  walletSecret: WalletSecret
  indyLedgers: IndyVdrPoolConfig[]
  indyBesuConfig: IndyBesuConfig
}

export type HekaWalletAgent = Awaited<ReturnType<typeof createAgent>>

export const useHekaAgent = (): ReturnType<typeof useOptionalAgent<HekaWalletAgent>> =>
  useOptionalAgent<HekaWalletAgent>()

export async function createAgent({ walletSecret, indyLedgers, indyBesuConfig }: CreateAgentOptions) {
  if (!walletSecret.key) {
    throw new Error('Wallet key is not defined')
  }

  const indyCredentialFormat = new LegacyIndyDidCommCredentialFormatService()
  const indyProofFormat = new LegacyIndyDidCommProofFormatService()

  return new Agent({
    config: {
      logger: new CredoLogger('Credo Agent'),
      autoUpdateStorageOnStartup: true,
      allowInsecureHttpUrls: true,
    },
    dependencies: agentDependencies,
    modules: {
      ...getAgentModules({
        walletSecret,
        indyNetworks: indyLedgers,
      }),
      didcomm: new DidCommModule({
        useDidSovPrefixWhereAllowed: true,
        connections: {
          autoAcceptConnections: true,
        },
        credentials: {
          autoAcceptCredentials: DidCommAutoAcceptCredential.ContentApproved,
          credentialProtocols: [
            new DidCommCredentialV1Protocol({ indyCredentialFormat }),
            new DidCommCredentialV2Protocol({
              credentialFormats: [
                indyCredentialFormat,
                new AnonCredsDidCommCredentialFormatService(),
                new DataIntegrityDidCommCredentialFormatService(),
              ],
            }),
          ],
        },
        proofs: {
          autoAcceptProofs: DidCommAutoAcceptProof.ContentApproved,
          proofProtocols: [
            new DidCommProofV1Protocol({ indyProofFormat }),
            new DidCommProofV2Protocol({
              proofFormats: [
                indyProofFormat,
                new AnonCredsDidCommProofFormatService(),
                new DidCommDifPresentationExchangeProofFormatService(),
              ],
            }),
          ],
        },
        // Mediator connection is set up after agent initialization, see 'setupMediatorIfNeeded'
        mediationRecipient: {
          mediatorPickupStrategy: DidCommMediatorPickupStrategy.PickUpV2,
        },
      }),
      dids: new DidsModule({
        resolvers: [
          new WebDidResolver(),
          new KeyDidResolver(),
          new PeerDidResolver(),
          new JwkDidResolver(),
          new IndyBesuDidResolver(indyBesuConfig),
          new HederaDidResolver(),
        ],
        registrars: [new KeyDidRegistrar(), new PeerDidRegistrar(), new JwkDidRegistrar(), new HederaDidRegistrar()],
      }),
      anoncreds: new AnonCredsModule({
        anoncreds: NativeAnoncreds.instance,
        registries: [
          new IndyVdrAnonCredsRegistry(),
          new IndyBesuAnoncredsRegistry(indyBesuConfig),
          new HederaAnonCredsRegistry(),
        ],
        tailsFileService: new TailsService(),
      }),
      hedera: new HederaModule({
        networks: [
          {
            network: 'testnet',
            operatorId: Config.HEDERA_OPERATOR_ID ?? '0.0.5489553',
            operatorKey:
              Config.HEDERA_OPERATOR_KEY ??
              '302e020100300506032b6570042204209f54b75b6238ced43e41b1463999cb40bf2f7dd2c9fd4fd3ef780027c016a138',
          },
        ],
      }),
      x509: new X509Module({
        trustedCertificates: [...TRUSTED_X509_CERTIFICATES],
      }),
    },
  })
}

export async function createPublicDidOrGetExisting(agent: Agent): Promise<string> {
  let publicDid = await AsyncStorage.getItem(PUBLIC_DID_KEY)

  if (publicDid) {
    const didRecordSearchResult = await agent.dids.getCreatedDids({
      method: 'peer',
      did: publicDid,
    })

    // Should not be possible from UI/UX perspective or other reasons, just sanity check
    if (didRecordSearchResult.length === 0) {
      throw new Error('Public DID is already created, but corresponding DID record is not found')
    }
  } else {
    const routing = await agent.didcomm.mediationRecipient.getRouting({})

    const { didDocument: didPeerDocument } = await createPeerDidFromServices(
      agent.context,
      routingToServices(routing),
      PeerDidNumAlgo.MultipleInceptionKeyWithoutDoc
    )

    publicDid = didPeerDocument.id
    await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid!)
  }

  return publicDid!
}

export async function tryRestartExistingAgent(agent: Agent, credentials: WalletSecret): Promise<boolean> {
  if (!credentials.key) {
    console.warn('Wallet credentials key is not defined')
    return false
  }

  try {
    await agent.initialize()
  } catch (error) {
    console.warn(`Agent restart failed with error ${error}`)
    // if the existing agents wallet cannot be opened or initialize() fails it was
    // again not a clean shutdown and the agent should be replaced, not restarted
    return false
  }

  return true
}

export async function createPublicInvitationOrGetExisting(
  agent: Agent,
  invitationDid: string,
  label: string
): Promise<string> {
  const publicInvitationId = await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)

  let publicInvitationRecord: DidCommOutOfBandRecord

  if (publicInvitationId) {
    publicInvitationRecord = await agent.didcomm.oob.findById(publicInvitationId)

    // Should not be possible from UI/UX perspective or other reasons, just sanity check
    if (!publicInvitationRecord) {
      throw new Error('Public invitation is already created, but corresponding invitation record is not found')
    }
  } else {
    publicInvitationRecord = await agent.didcomm.oob.createInvitation({
      label,
      invitationDid,
      multiUseInvitation: true,
    })

    await AsyncStorage.setItem(PUBLIC_INVITATION_ID_KEY, publicInvitationRecord.id)
  }

  return publicInvitationRecord.outOfBandInvitation.toUrl({ domain: 'didcomm://invite' })
}

export async function ensureExampleCredentialCreated(agent: Agent): Promise<void> {
  const exampleCredentialRecords = await agent.sdJwtVc.findAllByQuery({
    vct: EXAMPLE_CREDENTIAL_VCT,
  })

  if (exampleCredentialRecords.length > 0) return

  const issuerPublicKey = await agent.kms.createKey({
    type: {
      kty: 'OKP',
      crv: 'Ed25519',
    },
  })

  const issuerDidCreateResult = await agent.dids.create({
    method: 'key',
    options: { keyId: issuerPublicKey.keyId },
  })

  if (!issuerDidCreateResult.didState.didDocument) {
    throw new Error(
      `Failed to create issuer DID for example credential: ${JSON.stringify(issuerDidCreateResult, null, 2)}`
    )
  }

  const holderPublicKey = await agent.kms.createKey({
    type: {
      kty: 'OKP',
      crv: 'Ed25519',
    },
  })

  const holderDidCreateResult = await agent.dids.create({
    method: 'key',
    options: { keyId: holderPublicKey },
  })

  if (!holderDidCreateResult.didState.didDocument) {
    throw new Error(
      `Failed to create holder DID for example credential: ${JSON.stringify(issuerDidCreateResult, null, 2)}`
    )
  }

  const holderKid = getDidKeyVerificationMethodId(holderDidCreateResult.didState.didDocument.id)

  const signedSdJwtVc = await agent.sdJwtVc.sign({
    holder: { method: 'did', didUrl: holderKid },
    issuer: {
      method: 'did',
      didUrl: getDidKeyVerificationMethodId(issuerDidCreateResult.didState.didDocument.id),
    },
    payload: {
      vct: EXAMPLE_CREDENTIAL_VCT,
      university: 'innsbruck',
      degree: 'bachelor',
      name: 'John Doe',
      cnf: {
        kid: holderKid,
      },
    },
    disclosureFrame: {
      _sd: ['university', 'name'],
    },
  })

  const record = new SdJwtVcRecord({
    credentialInstances: [
      {
        compactSdJwtVc: signedSdJwtVc.compact,
      },
    ],
  })

  setOpenId4VcCredentialMetadata(record, EXAMPLE_CREDENTIAL_METADATA)

  await agent.sdJwtVc.store({ record })
}

/**
 * Connects to the mediator using provided invitation URL, requests mediation and starts message pickup.
 * Does nothing if the default mediator is already set up - in this case message pickup is started by Credo on agent initialization.
 *
 * Note: We intentionally don't use 'mediatorInvitationUrl' option of Credo mediation recipient module,
 * as it blocks agent initialization until the mediator is connected (so wallet cannot be initialized offline).
 *
 * Concurrent calls for the same agent share a single setup attempt, so they don't create duplicate mediator connections.
 */
export function setupMediatorIfNeeded(agent: Agent, mediatorInvitationUrl: string): Promise<void> {
  const attemptInProgress = mediatorSetupAttemptsInProgress.get(agent)
  if (attemptInProgress) return attemptInProgress

  const attempt = connectToMediator(agent, mediatorInvitationUrl).finally(() =>
    mediatorSetupAttemptsInProgress.delete(agent)
  )
  mediatorSetupAttemptsInProgress.set(agent, attempt)
  return attempt
}

async function connectToMediator(agent: Agent, mediatorInvitationUrl: string): Promise<void> {
  const existingMediationRecord = await agent.didcomm.mediationRecipient.findDefaultMediator()
  if (existingMediationRecord) return

  const outOfBandInvitation = await agent.didcomm.oob.parseInvitation(mediatorInvitationUrl)

  // Clean up leftovers of previous unsuccessful attempt, if any
  const existingOutOfBandRecord = await agent.didcomm.oob.findByReceivedInvitationId(outOfBandInvitation.id)
  if (existingOutOfBandRecord) {
    const existingConnectionRecords = await agent.didcomm.connections.findAllByOutOfBandId(existingOutOfBandRecord.id)
    for (const connectionRecord of existingConnectionRecords) {
      await agent.didcomm.connections.deleteById(connectionRecord.id)
    }
    await agent.didcomm.oob.deleteById(existingOutOfBandRecord.id)
  }

  // We don't want to use the current default mediator (if any) when connecting to the mediator
  const routing = await agent.didcomm.mediationRecipient.getRouting({ useDefaultMediator: false })

  let { connectionRecord: mediatorConnectionRecord } = await agent.didcomm.oob.receiveInvitation(outOfBandInvitation, {
    label: '',
    alias: 'Mediator',
    routing,
  })

  if (!mediatorConnectionRecord) {
    throw new Error('Failed to create connection with mediator')
  }

  mediatorConnectionRecord = await agent.didcomm.connections.returnWhenIsConnected(mediatorConnectionRecord.id, {
    timeoutMs: MEDIATOR_CONNECTION_TIMEOUT_MS,
  })

  const mediationRecord = await agent.didcomm.mediationRecipient.requestAndAwaitGrant(
    mediatorConnectionRecord,
    MEDIATION_GRANT_TIMEOUT_MS
  )
  await agent.didcomm.mediationRecipient.setDefaultMediator(mediationRecord)
  await agent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)
}

/**
 * Tries to set up the mediator without blocking further wallet initialization.
 * If the mediator is not reachable, setup is retried in background.
 */
export async function trySetupMediator(agent: Agent, mediatorInvitationUrl: string): Promise<void> {
  try {
    await setupMediatorIfNeeded(agent, mediatorInvitationUrl)
  } catch (error) {
    agent.config.logger.warn('Failed to set up mediator, will retry in background', { error })
    setupMediatorInBackground(agent, mediatorInvitationUrl)
  }
}

/**
 * Keeps trying to set up the mediator in background (with exponential backoff) until it succeeds or agent is shut down.
 * Used when the mediator is not reachable on agent initialization (e.g. device is offline or mediator is unavailable).
 */
export function setupMediatorInBackground(agent: Agent, mediatorInvitationUrl: string): void {
  if (agentsWithMediatorSetupInProgress.has(agent)) return
  agentsWithMediatorSetupInProgress.add(agent)

  const scheduleAttempt = (delayMs: number) =>
    setTimeout(async () => {
      if (!agent.isInitialized) {
        agentsWithMediatorSetupInProgress.delete(agent)
        return
      }

      try {
        await setupMediatorIfNeeded(agent, mediatorInvitationUrl)
        agentsWithMediatorSetupInProgress.delete(agent)
        agent.config.logger.info('Mediator is set up')
      } catch (error) {
        const nextDelayMs = Math.min(delayMs * 2, MEDIATOR_SETUP_RETRY_MAX_DELAY_MS)
        agent.config.logger.warn(`Failed to set up mediator, retrying in ${nextDelayMs / 1000}s`, { error })
        scheduleAttempt(nextDelayMs)
      }
    }, delayMs)

  scheduleAttempt(MEDIATOR_SETUP_RETRY_MIN_DELAY_MS)
}

export async function createAnoncredsLinkSecretIfRequired(agent: HekaWalletAgent): Promise<void> {
  // If we don't have any link secrets yet, we will create a
  // default link secret that will be used for all anoncreds
  // credential requests.
  const linkSecretIds = await agent.modules.anoncreds.getLinkSecretIds()
  if (linkSecretIds.length === 0) {
    await agent.modules.anoncreds.createLinkSecret({
      setAsDefault: true,
    })
  }
}
