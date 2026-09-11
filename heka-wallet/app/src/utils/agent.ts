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
import {
  loadCachedTrustSources as loadConfiguredTrustCache,
  refreshTrustSources as refreshConfiguredTrustSources,
  TrustCacheLoadResult,
  TrustSourceRefreshResult,
  TrustVerifyAgent,
} from './trust/loteTrustSource'
import { ensureTrustAnchors as bootstrapTrustAnchors, TrustBootstrapResult } from './trust/trustBootstrap'
import { composeTrustedCertificates } from './trust/trustComposition'
import { loadTrustConfiguration } from './trust/trustConfiguration'
import { createTrustSourceCache } from './trust/trustSourceCache'
import { TrustSourceConfig } from './trust/trustSources'
import { trustSubjectFor, X509VerificationContext } from './trust/verificationSubject'

const PUBLIC_DID_KEY = 'PUBLIC_DID'

const PUBLIC_INVITATION_ID_KEY = 'PUBLIC_INVITATION_ID'

/**
 * The X.509 trust configuration (`TRUSTED_MDOC_ISSUER_CERTIFICATES`, `TRUSTED_REQUEST_SIGNER_CERTIFICATES`,
 * `HEKA_SERVICE_ROOT_CERTIFICATE`, `TRUST_SOURCES`), parsed and validated once at startup. Nothing is
 * bundled in code — a build trusts only what its configuration says, so a real deployment can never
 * inherit the identity service's dev mDL issuer key. An invalid value is logged as a startup error
 * and contributes nothing (see {@link TRUST_CONFIGURATION_ERRORS}) instead of crashing module evaluation.
 */
const TRUST_CONFIGURATION = loadTrustConfiguration(Config, (message) =>
  new CredoLogger('Trust configuration').error(message)
)

/** Messages of the trust settings that failed to parse at startup (empty when all are valid). */
export const TRUST_CONFIGURATION_ERRORS: readonly string[] = TRUST_CONFIGURATION.errors

const STATIC_ANCHORS = TRUST_CONFIGURATION.staticAnchors

/**
 * Static mdoc **issuer** trust anchors (base64 DER) — the fallback set that always applies to mdoc
 * verification, alongside the anchors learned from the configured trust sources
 * ({@link TRUST_SOURCES}, refreshed by {@link refreshTrustSources}). Empty unless
 * `TRUSTED_MDOC_ISSUER_CERTIFICATES` is set: tenant issuers are learned from the Heka scheme list, so
 * this is only for an issuer that publishes no trust list (e.g. the identity service's legacy
 * service-wide `MDL_ISSUER_CERTIFICATE` in local development).
 */
export const TRUSTED_MDOC_ISSUER_CERTIFICATES: readonly string[] = STATIC_ANCHORS.mdocIssuers

/**
 * The Heka service **root CA** (base64 DER). It plays two roles: it pins the signer of the default
 * Heka trust sources, and it is the chain root of the SD-JWT VC `x5c` issuer leaves and of the
 * request-signing / access-certificate leaves. It is NOT itself an mdoc issuer anchor. Obtain it from
 * the identity service's `GET /x509/signers/root-certificate` and set `HEKA_SERVICE_ROOT_CERTIFICATE`.
 * Empty by default = the default sources cannot be verified (their refresh is skipped).
 */
const HEKA_SERVICE_ROOT_CERTIFICATES: readonly string[] = TRUST_CONFIGURATION.serviceRoots

/**
 * The signed trust lists the wallet learns anchors from (ETSI TS 119 602 LoTE JWTs). `TRUST_SOURCES`
 * (JSON) configures them explicitly; by default the two Heka scheme lists under `AGENCY_PROVIDER_URL`
 * (`/trust-list/eaa-providers`, `/trust-list/wrpac-providers`), pinned to the service root. Each
 * source vouches only for its role and, when classified, only for the attestation types it lists.
 */
export const TRUST_SOURCES: TrustSourceConfig[] = TRUST_CONFIGURATION.sources

/**
 * On-device cache of the signed trust-list documents (AsyncStorage). Every successful refresh writes
 * it; `loadCachedTrustSources` / `ensureTrustAnchors` re-verify the documents on load, so the cache is
 * a latency optimisation, never a trust assumption.
 */
const trustSourceCache = createTrustSourceCache(AsyncStorage)

/**
 * Trusted X.509 certificates for verifying OpenID4VP authorization-request **signers** (the
 * verifier's `x5c` request signature). This is a DISTINCT trust domain from
 * `TRUSTED_MDOC_ISSUER_CERTIFICATES`, which anchors credential (MSO) signatures — do not conflate them.
 *
 * Set `TRUSTED_REQUEST_SIGNER_CERTIFICATES` to the verifier's request-signing **leaf** cert (base64
 * DER) for the `x509_hash` trust model, or its **root/CA** for `x509_san_dns` — obtainable from the
 * verifier's `/x509/signers` endpoint. Empty by default = only the learned access-certificate anchors
 * and the service root are trusted.
 */
export const TRUSTED_REQUEST_SIGNER_CERTIFICATES: readonly string[] = STATIC_ANCHORS.requestSigners

export type { X509VerificationContext }

/**
 * Resolve trusted certificates per verification context (see `composeTrustedCertificates`): the
 * anchors learned from the trust sources selected for the subject (role + classification) plus the
 * static set of that trust domain — except for a credential type **classified** by a configured
 * source, which is trusted through its classifying sources only (the static sets, service root
 * included, apply to unclassified types only). Contexts a holder never verifies (attestations)
 * resolve to `undefined` → Credo's global set. Used by the main and lean DC API agents.
 */
export const trustedCertificatesForVerification = (verification: X509VerificationContext): string[] | undefined => {
  const subject = trustSubjectFor(verification)
  if (!subject) return undefined
  return composeTrustedCertificates(TRUST_SOURCES, subject, {
    mdocIssuers: TRUSTED_MDOC_ISSUER_CERTIFICATES,
    requestSigners: TRUSTED_REQUEST_SIGNER_CERTIFICATES,
    serviceRoots: HEKA_SERVICE_ROOT_CERTIFICATES,
  })
}

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
        mediatorInvitationUrl: Config.MEDIATOR_URL,
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
        mediationRecipient: {
          mediatorInvitationUrl: Config.MEDIATOR_URL,
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
        trustedCertificates: [...TRUSTED_MDOC_ISSUER_CERTIFICATES],
        getTrustedCertificatesForVerification: (_agentContext, { verification }) =>
          trustedCertificatesForVerification(verification),
      }),
    },
  })
}

/**
 * Fetch + verify every configured trust source ({@link TRUST_SOURCES}) and refresh the anchors that
 * `trustedCertificatesForVerification` then trusts. Best-effort: returns one result per source rather
 * than throwing, and a failed source keeps its previously-trusted anchors. Sources without pinned
 * signers (no `HEKA_SERVICE_ROOT_CERTIFICATE` for the defaults) are skipped. Call after the agent is
 * initialized.
 */
export async function refreshTrustSources(agent: HekaWalletAgent): Promise<TrustSourceRefreshResult[]> {
  // The concrete agent satisfies the loose structural TrustVerifyAgent at runtime; the cast bridges the
  // strict Credo KMS/X509 option types to the decoupled (test-friendly) interface.
  return refreshConfiguredTrustSources(agent as unknown as TrustVerifyAgent, TRUST_SOURCES, { cache: trustSourceCache })
}

/**
 * Load the last verified trust lists from the on-device cache (re-verified, no network) into this
 * runtime's anchor store. Call after the agent is initialized, before the network refresh.
 */
export async function loadCachedTrustSources(agent: HekaWalletAgent): Promise<TrustCacheLoadResult[]> {
  return loadConfiguredTrustCache(agent as unknown as TrustVerifyAgent, TRUST_SOURCES, trustSourceCache)
}

/**
 * Cache-first trust bootstrap for a fresh runtime (the DC API overlay): load the cache; await one
 * bounded network refresh only when a source has no usable cache; refresh in the background when the
 * cache is merely stale. See `ensureTrustAnchors` in `trust/trustBootstrap.ts`.
 */
export async function ensureTrustAnchors(agent: HekaWalletAgent): Promise<TrustBootstrapResult> {
  return bootstrapTrustAnchors(agent as unknown as TrustVerifyAgent, TRUST_SOURCES, { cache: trustSourceCache })
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

export async function setupMediatorWithPublicDidIfNeeded(agent: Agent, mediatorPublicDid: string): Promise<void> {
  const existingMediationRecord = await agent.didcomm.mediationRecipient.findDefaultMediator()
  if (existingMediationRecord) return

  let { connectionRecord: mediatorConnectionRecord } = await agent.didcomm.oob.receiveImplicitInvitation({
    label: 'Cloud Mediator',
    did: mediatorPublicDid,
    alias: 'Cloud Mediator',
    autoAcceptConnection: true,
  })

  if (!mediatorConnectionRecord) {
    throw new Error(`Failed to connect with mediator via public DID: ${mediatorPublicDid}`)
  }

  mediatorConnectionRecord = await agent.didcomm.connections.returnWhenIsConnected(mediatorConnectionRecord.id, {
    timeoutMs: 5000,
  })

  const mediationRecord = await agent.didcomm.mediationRecipient.provision(mediatorConnectionRecord)
  await agent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)
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
