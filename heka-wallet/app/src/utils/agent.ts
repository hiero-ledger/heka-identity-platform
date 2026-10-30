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
  DidCommOutOfBandInvitation,
  DidCommOutOfBandRecord,
  DidCommOutOfBandRole,
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

// Credo fetches a short invitation URL (without 'oob', 'c_i' or 'd_m') or resolves a mediator 'did:web' without a working
// timeout, so a stalled request would block the mediator setup (and the first launch) until the OS gives up
const MEDIATOR_INVITATION_RESOLUTION_TIMEOUT_MS = 15000
const MEDIATOR_CONNECTION_TIMEOUT_MS = 10000
const MEDIATION_GRANT_TIMEOUT_MS = 10000
const MEDIATOR_SETUP_RETRY_MIN_DELAY_MS = 5000
const MEDIATOR_SETUP_RETRY_MAX_DELAY_MS = 5 * 60 * 1000

const agentsWithMediatorSetupInProgress = new WeakSet<Agent>()
const mediatorSetupAttemptsInProgress = new WeakMap<Agent, Promise<void>>()
const publicInvitationCreationsInProgress = new WeakMap<Agent, Promise<string>>()

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

/**
 * Returns true if DIDComm messages sent to the DID are routed through a mediator.
 * The public DID created while the mediator was not set up has no routing keys and uses the default queue endpoint.
 */
async function isDidRoutedThroughMediator(agent: Agent, did: string): Promise<boolean> {
  const didDocument = await agent.dids.resolveDidDocument(did)
  return didDocument.didCommServices.some((service) => (service.routingKeys?.length ?? 0) > 0)
}

/**
 * Creates the multi-use public invitation, or returns the existing one.
 * Call it only once the default mediator is set up (see 'createPublicInvitationWhenMediatorReady'),
 * otherwise the invitation cannot receive DIDComm messages.
 * Concurrent calls are not deduplicated here, use 'createPublicInvitationWhenMediatorReady' for that.
 *
 * If the public DID is routed through a mediator, it is used as the invitation DID.
 * Otherwise (the DID was created while the mediator was not reachable), the invitation uses inline services
 * with the current routing, that is the default mediator.
 */
export async function createPublicInvitationOrGetExisting(
  agent: Agent,
  publicDid: string,
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
    const usePublicDid = await isDidRoutedThroughMediator(agent, publicDid)
    if (!usePublicDid) {
      agent.config.logger.info(
        'Public DID is not routed through a mediator, creating the public invitation with inline services'
      )
    }

    publicInvitationRecord = await agent.didcomm.oob.createInvitation({
      label,
      invitationDid: usePublicDid ? publicDid : undefined,
      multiUseInvitation: true,
    })

    await AsyncStorage.setItem(PUBLIC_INVITATION_ID_KEY, publicInvitationRecord.id)
  }

  return publicInvitationRecord.outOfBandInvitation.toUrl({ domain: 'didcomm://invite' })
}

/**
 * Creates the public invitation (or returns the existing one) for the wallet's public DID.
 * Meant to be passed as the 'onMediatorReady' callback of 'trySetupMediator', so the invitation is created only
 * once the default mediator is set up, during agent startup or later by the background mediator setup.
 *
 * Concurrent calls for the same agent share a single creation, so they don't create duplicate public DIDs or invitations
 * (e.g. the callback of a background mediator setup still pending from before an agent restart and the restart's own one).
 */
export function createPublicInvitationWhenMediatorReady(agent: Agent, label: string): Promise<string> {
  const creationInProgress = publicInvitationCreationsInProgress.get(agent)
  if (creationInProgress) return creationInProgress

  const creation = createPublicDidAndInvitationOrGetExisting(agent, label).finally(() =>
    publicInvitationCreationsInProgress.delete(agent)
  )
  publicInvitationCreationsInProgress.set(agent, creation)
  return creation
}

async function createPublicDidAndInvitationOrGetExisting(agent: Agent, label: string): Promise<string> {
  const publicDid = await createPublicDidOrGetExisting(agent)
  return createPublicInvitationOrGetExisting(agent, publicDid, label)
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
 * Where the wallet gets the mediator invitation from: an invitation URL, or a public DID of the mediator (implicit invitation).
 */
export type MediatorSource = { type: 'invitationUrl'; invitationUrl: string } | { type: 'publicDid'; publicDid: string }

/**
 * Returns the mediator source for the 'MEDIATOR_URL' and 'MEDIATOR_PUBLIC_DID' config values, or undefined if neither is set.
 * If both are set, the invitation URL is used and a warning is logged.
 */
export function getMediatorSource(
  { mediatorUrl, mediatorPublicDid }: { mediatorUrl?: string; mediatorPublicDid?: string },
  logger: { warn: (message: string) => void }
): MediatorSource | undefined {
  if (mediatorUrl) {
    if (mediatorPublicDid) {
      logger.warn('Both MEDIATOR_URL and MEDIATOR_PUBLIC_DID are set, MEDIATOR_PUBLIC_DID is ignored')
    }
    return { type: 'invitationUrl', invitationUrl: mediatorUrl }
  }

  if (mediatorPublicDid) return { type: 'publicDid', publicDid: mediatorPublicDid }

  return undefined
}

/**
 * Connects to the mediator using provided invitation URL or public DID, requests mediation and starts message pickup.
 * Does nothing if the default mediator is already set up - in this case message pickup is started by Credo on agent initialization.
 *
 * Note: We intentionally don't use 'mediatorInvitationUrl' option of Credo mediation recipient module,
 * as it blocks agent initialization until the mediator is connected (so wallet cannot be initialized offline).
 *
 * Concurrent calls for the same agent share a single setup attempt, so they don't create duplicate mediator connections.
 */
export function setupMediatorIfNeeded(agent: Agent, mediatorSource: MediatorSource): Promise<void> {
  const attemptInProgress = mediatorSetupAttemptsInProgress.get(agent)
  if (attemptInProgress) return attemptInProgress

  const attempt = connectToMediator(agent, mediatorSource).finally(() => mediatorSetupAttemptsInProgress.delete(agent))
  mediatorSetupAttemptsInProgress.set(agent, attempt)
  return attempt
}

async function connectToMediator(agent: Agent, mediatorSource: MediatorSource): Promise<void> {
  const existingMediationRecord = await agent.didcomm.mediationRecipient.findDefaultMediator()
  if (existingMediationRecord) return

  let { connectionRecord: mediatorConnectionRecord } =
    mediatorSource.type === 'publicDid'
      ? await receiveMediatorImplicitInvitation(agent, mediatorSource.publicDid)
      : await receiveMediatorInvitation(agent, mediatorSource.invitationUrl)

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
  // If pickup failed to start here, a retry would find the default mediator and return, so pickup would start only
  // on the next agent initialization. With the 'PickUpV2' (polling) strategy this only reads local records and starts
  // an interval (pickup errors happen inside it), so it is not expected. Revisit if switching to 'PickUpV2LiveMode'.
  await agent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)
}

async function receiveMediatorInvitation(agent: Agent, mediatorInvitationUrl: string) {
  const outOfBandInvitation = await withTimeout<DidCommOutOfBandInvitation>(
    agent.didcomm.oob.parseInvitation(mediatorInvitationUrl),
    MEDIATOR_INVITATION_RESOLUTION_TIMEOUT_MS,
    'Timed out resolving the mediator invitation URL'
  )

  const existingOutOfBandRecord = await agent.didcomm.oob.findByReceivedInvitationId(outOfBandInvitation.id)
  await deleteMediatorConnectionLeftovers(agent, existingOutOfBandRecord ? [existingOutOfBandRecord] : [])

  // We don't want to use the current default mediator (if any) when connecting to the mediator
  const routing = await agent.didcomm.mediationRecipient.getRouting({ useDefaultMediator: false })

  return agent.didcomm.oob.receiveInvitation(outOfBandInvitation, {
    label: '',
    alias: 'Mediator',
    routing,
  })
}

async function receiveMediatorImplicitInvitation(agent: Agent, mediatorDid: string) {
  // Credo resolves the DID again when receiving the invitation, without a timeout.
  // Resolvers that allow caching (e.g. 'did:web', 'did:hedera') cache the result, so the DID resolved here is not fetched again.
  // Non-caching resolvers (e.g. 'did:indybesu') fetch it again, and only this resolution is bounded.
  await withTimeout(
    agent.dids.resolveDidDocument(mediatorDid),
    MEDIATOR_INVITATION_RESOLUTION_TIMEOUT_MS,
    'Timed out resolving the mediator DID'
  )

  // The implicit invitation id is the DID itself. Credo does not reject a duplicate implicit invitation,
  // so there may be more than one leftover out-of-band record.
  const existingOutOfBandRecords = await agent.didcomm.oob.findAllByQuery({
    invitationId: mediatorDid,
    role: DidCommOutOfBandRole.Receiver,
  })
  await deleteMediatorConnectionLeftovers(agent, existingOutOfBandRecords)

  // We don't want to use the current default mediator (if any) when connecting to the mediator
  const routing = await agent.didcomm.mediationRecipient.getRouting({ useDefaultMediator: false })

  return agent.didcomm.oob.receiveImplicitInvitation({
    did: mediatorDid,
    label: '',
    alias: 'Mediator',
    routing,
  })
}

/**
 * Deletes the out-of-band records and connections left by a previous unsuccessful mediator setup attempt.
 * The mediation record of a failed attempt is left on purpose: it is bound to the deleted connection,
 * never becomes the default mediator and does not affect the setup.
 */
async function deleteMediatorConnectionLeftovers(
  agent: Agent,
  outOfBandRecords: DidCommOutOfBandRecord[]
): Promise<void> {
  for (const outOfBandRecord of outOfBandRecords) {
    const connectionRecords = await agent.didcomm.connections.findAllByOutOfBandId(outOfBandRecord.id)
    for (const connectionRecord of connectionRecords) {
      await agent.didcomm.connections.deleteById(connectionRecord.id)
    }
    await agent.didcomm.oob.deleteById(outOfBandRecord.id)
  }
}

/**
 * Rejects with an error with the given message if the promise does not settle within 'timeoutMs'.
 * The promise itself is not cancelled: its late result is ignored.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })
  // A late rejection of the abandoned promise must not become an unhandled rejection
  promise.catch(() => undefined)
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

/**
 * Called once the default mediator is set up, either during agent startup or by the background mediator setup.
 */
export type OnMediatorReady = () => Promise<void> | void

async function runOnMediatorReady(agent: Agent, onMediatorReady?: OnMediatorReady): Promise<void> {
  if (!onMediatorReady) return

  // A callback failure must not break agent startup or the background mediator setup
  try {
    await onMediatorReady()
  } catch (error) {
    agent.config.logger.error('Failed to run the mediator ready callback', { error })
  }
}

/**
 * Tries to set up the mediator without blocking further wallet initialization.
 * If the mediator is not reachable, setup is retried in background.
 *
 * 'onMediatorReady' runs once the mediator is set up: before this function returns if the setup succeeds right away,
 * or later, when the background setup succeeds. Its errors are logged and not rethrown.
 */
export async function trySetupMediator(
  agent: Agent,
  mediatorSource: MediatorSource,
  onMediatorReady?: OnMediatorReady
): Promise<void> {
  try {
    await setupMediatorIfNeeded(agent, mediatorSource)
  } catch (error) {
    agent.config.logger.warn('Failed to set up mediator, will retry in background', { error })
    setupMediatorInBackground(agent, mediatorSource, onMediatorReady)
    return
  }

  await runOnMediatorReady(agent, onMediatorReady)
}

/**
 * Keeps trying to set up the mediator in background (with exponential backoff) until it succeeds or agent is shut down.
 * Used when the mediator is not reachable on agent initialization (e.g. device is offline or mediator is unavailable).
 *
 * 'onMediatorReady' runs once after the setup succeeds. If the background setup for the agent is already running,
 * the call does nothing, including registering the callback.
 */
export function setupMediatorInBackground(
  agent: Agent,
  mediatorSource: MediatorSource,
  onMediatorReady?: OnMediatorReady
): void {
  if (agentsWithMediatorSetupInProgress.has(agent)) return
  agentsWithMediatorSetupInProgress.add(agent)

  const scheduleAttempt = (delayMs: number) =>
    setTimeout(async () => {
      if (!agent.isInitialized) {
        agentsWithMediatorSetupInProgress.delete(agent)
        return
      }

      try {
        await setupMediatorIfNeeded(agent, mediatorSource)
      } catch (error) {
        const nextDelayMs = Math.min(delayMs * 2, MEDIATOR_SETUP_RETRY_MAX_DELAY_MS)
        agent.config.logger.warn(`Failed to set up mediator, retrying in ${nextDelayMs / 1000}s`, { error })
        scheduleAttempt(nextDelayMs)
        return
      }

      agentsWithMediatorSetupInProgress.delete(agent)
      agent.config.logger.info('Mediator is set up')
      await runOnMediatorReady(agent, onMediatorReady)
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
